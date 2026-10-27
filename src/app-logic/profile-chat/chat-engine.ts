/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The agentic loop behind the profile chat. It knows nothing about Redux: it
 * streams one user turn from the Anthropic API, runs the tool calls the model
 * asks for, and reports every message it adds to the conversation.
 *
 * The conversation must stay append-only. Earlier messages, including their
 * thinking blocks, are sent back unchanged, and every tool_use gets a matching
 * tool_result, even when the turn is cancelled or cut short.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ChatError, ChatTurnOutcome } from 'firefox-profiler/types';
import { getSystemPrompt, PROFILER_CLI_TOOL_NAME } from './system-prompt';

export const CHAT_MODEL = 'claude-opus-5-5';

const MAX_TOKENS = 16000;

// Tool rounds allowed for one user message before the turn is stopped.
export const MAX_TOOL_ITERATIONS = 25;

const PROFILER_CLI_TOOL: BetaTool = {
  name: PROFILER_CLI_TOOL_NAME,
  description:
    'Run a profiler-cli command against the profile that is open in the page and return its text output. ' +
    'Pass the command line without the program name, e.g. "thread samples --limit 20" or "zoom push 2.7,3.1". ' +
    'Commands that select a thread, zoom or push filters change what the user sees.',
  input_schema: {
    type: 'object',
    properties: {
      args: {
        type: 'string',
        description:
          'The profiler-cli command line, e.g. "thread functions --search GC". Quote arguments with spaces.',
      },
    },
    required: ['args'],
    additionalProperties: false,
  },
  strict: true,
};

export type ToolRunResult = {
  text: string;
  isError: boolean;
};

export type RunChatTurnOptions = {
  client: Anthropic;
  /** The conversation so far, ending with the new user message. */
  history: BetaMessageParam[];
  /** Runs one profiler-cli command line. */
  runTool: (args: string) => Promise<ToolRunResult>;
  signal: AbortSignal;
  /** Called with the visible text streamed so far for the current response. */
  onTextDelta: (text: string) => void;
  /** Called for each message appended to the conversation. */
  onMessage: (message: BetaMessageParam) => void;
};

export function createChatClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

function _getToolUses(message: BetaMessage): BetaToolUseBlock[] {
  return message.content.filter(
    (block): block is BetaToolUseBlock => block.type === 'tool_use'
  );
}

function _errorResult(
  toolUse: BetaToolUseBlock,
  text: string
): BetaToolResultBlockParam {
  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: text,
    is_error: true,
  };
}

function _getArgs(toolUse: BetaToolUseBlock): string | null {
  const input = toolUse.input as { args?: unknown } | null;
  if (
    toolUse.name !== PROFILER_CLI_TOOL_NAME ||
    typeof input?.args !== 'string'
  ) {
    return null;
  }
  return input.args;
}

async function _streamResponse(
  client: Anthropic,
  messages: BetaMessageParam[],
  signal: AbortSignal,
  onTextDelta: (text: string) => void
): Promise<BetaMessage> {
  const stream = client.beta.messages.stream(
    {
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: getSystemPrompt(),
      tools: [PROFILER_CLI_TOOL],
      messages,
      output_config: { effort: 'medium' },
      // Retries a refused request on another model instead of stopping.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    },
    { signal }
  );

  let text = '';
  for await (const event of stream) {
    if (
      event.type === 'content_block_start' &&
      event.content_block.type === 'text' &&
      text !== ''
    ) {
      text += '\n\n';
    } else if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      text += event.delta.text;
      onTextDelta(text);
    }
  }
  return stream.finalMessage();
}

/**
 * Run one user turn to completion: stream the response, run the requested
 * tools, and repeat until the model ends its turn or the turn is stopped.
 * API errors are thrown, except for an abort through `signal`, which ends the
 * turn as cancelled.
 */
export async function runChatTurn({
  client,
  history,
  runTool,
  signal,
  onTextDelta,
  onMessage,
}: RunChatTurnOptions): Promise<ChatTurnOutcome> {
  const messages = history.slice();
  const append = (message: BetaMessageParam) => {
    messages.push(message);
    onMessage(message);
  };
  // Every tool_use needs a tool_result in the next message, even when we stop.
  const answerAllWithError = (toolUses: BetaToolUseBlock[], text: string) => {
    if (toolUses.length > 0) {
      append({
        role: 'user',
        content: toolUses.map((toolUse) => _errorResult(toolUse, text)),
      });
    }
  };

  for (let iteration = 0; ; iteration++) {
    let message: BetaMessage;
    try {
      message = await _streamResponse(client, messages, signal, onTextDelta);
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError || signal.aborted) {
        return { type: 'cancelled' };
      }
      throw error;
    }

    append({ role: 'assistant', content: message.content });
    const toolUses = _getToolUses(message);

    switch (message.stop_reason) {
      case 'tool_use':
        break;
      case 'max_tokens':
        answerAllWithError(
          toolUses,
          'The response was cut off before this tool call was complete.'
        );
        return { type: 'max-tokens' };
      case 'refusal': {
        answerAllWithError(toolUses, 'The response was declined.');
        const explanation =
          message.stop_details?.type === 'refusal'
            ? (message.stop_details.explanation ?? null)
            : null;
        return { type: 'refusal', explanation };
      }
      default:
        // end_turn, and pause_turn, which only server tools produce.
        answerAllWithError(toolUses, 'This tool call was not run.');
        return { type: 'done' };
    }

    if (iteration + 1 >= MAX_TOOL_ITERATIONS) {
      answerAllWithError(
        toolUses,
        'Stopped: too many tool calls for one message.'
      );
      return { type: 'tool-limit' };
    }

    // Run sequentially: the commands share the store, and some change it.
    const results: BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      if (signal.aborted) {
        results.push(_errorResult(toolUse, 'Cancelled by the user.'));
        continue;
      }
      const args = _getArgs(toolUse);
      if (args === null) {
        results.push(
          _errorResult(
            toolUse,
            `Unknown tool or invalid input: ${toolUse.name}`
          )
        );
        continue;
      }
      try {
        const { text, isError } = await runTool(args);
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: text === '' ? '(no output)' : text,
          is_error: isError,
        });
      } catch (error) {
        results.push(_errorResult(toolUse, `Error: ${error.message}`));
      }
    }
    append({ role: 'user', content: results });

    if (signal.aborted) {
      return { type: 'cancelled' };
    }
  }
}

// The SDK's message is the status followed by the raw JSON body, so prefer
// the human-readable message from the body when there is one.
function _getApiErrorMessage(error: InstanceType<typeof Anthropic.APIError>) {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === 'string' ? message : error.message;
}

/**
 * Classify an error thrown by runChatTurn for display.
 */
export function describeChatError(error: unknown): ChatError {
  if (error instanceof Anthropic.AuthenticationError) {
    return { type: 'auth', message: _getApiErrorMessage(error) };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { type: 'permission', message: _getApiErrorMessage(error) };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { type: 'rate-limit' };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { type: 'connection', message: error.message };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      type: 'api',
      status: error.status ?? null,
      message: _getApiErrorMessage(error),
    };
  }
  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  };
}
