/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The chat provider for OpenAI-compatible Chat Completions endpoints: OpenAI,
 * OpenRouter, local servers such as Ollama or LM Studio, and gateways.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type { ChatError } from 'firefox-profiler/types';
import {
  getProfilerCliArgs,
  getSystemPromptParts,
  PROFILER_CLI_TOOL_DESCRIPTION,
  PROFILER_CLI_TOOL_NAME,
  PROFILER_CLI_TOOL_PARAMETERS,
} from '../system-prompt';
import { OPENAI_TOOL_ERROR_PREFIX } from './transcript';
import {
  describeUnknownChatError,
  type ChatProvider,
  type ProviderResponse,
  type ProviderStopReason,
  type ToolCall,
} from './types';

export type OpenAIChatProviderOptions = {
  // The name for error messages, e.g. "OpenAI" or "localhost:11434".
  name: string;
  baseURL: string;
  // Local servers usually don't need one.
  apiKey: string | null;
  model: string;
};

type StreamedToolCall = { id: string; name: string; arguments: string };

// Not strict: other servers than OpenAI may reject or ignore the field, and
// the arguments are checked anyway.
const PROFILER_CLI_TOOL: ChatCompletionFunctionTool = {
  type: 'function',
  function: {
    name: PROFILER_CLI_TOOL_NAME,
    description: PROFILER_CLI_TOOL_DESCRIPTION,
    parameters: PROFILER_CLI_TOOL_PARAMETERS,
  },
};

/**
 * A function tool call, with its JSON arguments checked. Unparseable arguments
 * are reported to the model as invalid input.
 */
export function parseFunctionToolCall(
  id: string,
  name: string,
  args: string
): ToolCall {
  let input: unknown = null;
  try {
    input = JSON.parse(args);
  } catch {
    // Left as null.
  }
  return { id, name, args: getProfilerCliArgs(name, input) };
}

function _getStopReason(
  finishReason: string | null,
  hasToolCalls: boolean,
  hasRefusal: boolean
): ProviderStopReason {
  switch (finishReason) {
    case 'length':
      return 'max-tokens';
    case 'content_filter':
      return 'refusal';
    default:
      if (hasRefusal) {
        return 'refusal';
      }
      // Some servers end with 'stop' even when there are tool calls.
      return hasToolCalls ? 'tool-calls' : 'end';
  }
}

// The SDK's message starts with the status, so prefer the message from the
// body when there is one.
function _getApiErrorMessage(error: InstanceType<typeof OpenAI.APIError>) {
  const body = error.error as { message?: unknown } | undefined;
  return typeof body?.message === 'string' ? body.message : error.message;
}

/**
 * Classify an error thrown by the openai SDK for display. `name` is the
 * provider name for the message.
 */
export function describeOpenAIError(error: unknown, name: string): ChatError {
  if (error instanceof OpenAI.AuthenticationError) {
    return {
      type: 'auth',
      provider: name,
      message: _getApiErrorMessage(error),
    };
  }
  if (error instanceof OpenAI.PermissionDeniedError) {
    return { type: 'permission', message: _getApiErrorMessage(error) };
  }
  if (error instanceof OpenAI.RateLimitError) {
    return { type: 'rate-limit', provider: name };
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return {
      type: 'connection',
      provider: name,
      message: error.message,
    };
  }
  if (error instanceof OpenAI.APIError) {
    return {
      type: 'api',
      status: error.status ?? null,
      message: _getApiErrorMessage(error),
    };
  }
  return describeUnknownChatError(error);
}

export function createOpenAIChatProvider({
  name,
  baseURL,
  apiKey,
  model,
}: OpenAIChatProviderOptions): ChatProvider<ChatCompletionMessageParam> {
  const client = new OpenAI({
    baseURL,
    // The SDK requires a key, but local servers ignore it.
    apiKey: apiKey ?? 'none',
    dangerouslyAllowBrowser: true,
  });
  const systemPrompt = getSystemPromptParts().join('\n\n');

  return {
    makeUserMessage(text, viewContext) {
      return {
        role: 'user',
        // A plain string, which every compatible server accepts.
        content: `${text}\n\n${viewContext}`,
      };
    },

    async streamResponse(
      history,
      signal,
      onText
    ): Promise<ProviderResponse<ChatCompletionMessageParam>> {
      const stream = await client.chat.completions.create(
        {
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...history],
          tools: [PROFILER_CLI_TOOL],
          stream: true,
        },
        { signal }
      );

      let text = '';
      let refusal = '';
      let finishReason: string | null = null;
      const toolCalls: StreamedToolCall[] = [];
      // OpenRouter asks for these to be sent back with tool calls, as some
      // models need their reasoning to continue.
      const reasoningDetails: unknown[] = [];
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (choice === undefined) {
          continue;
        }
        const { delta } = choice;
        if (delta?.content) {
          text += delta.content;
          onText(text);
        }
        if (delta?.refusal) {
          refusal += delta.refusal;
        }
        for (const toolCallDelta of delta?.tool_calls ?? []) {
          const index = toolCallDelta.index ?? toolCalls.length;
          toolCalls[index] ??= { id: '', name: '', arguments: '' };
          const toolCall = toolCalls[index];
          if (toolCallDelta.id) {
            toolCall.id = toolCallDelta.id;
          }
          if (toolCallDelta.function?.name && toolCall.name === '') {
            toolCall.name = toolCallDelta.function.name;
          }
          toolCall.arguments += toolCallDelta.function?.arguments ?? '';
        }
        const details = (delta as { reasoning_details?: unknown } | undefined)
          ?.reasoning_details;
        if (Array.isArray(details)) {
          reasoningDetails.push(...details);
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }

      const streamedToolCalls = toolCalls
        .filter((toolCall) => toolCall !== undefined)
        .map((toolCall, index) => ({
          ...toolCall,
          // Some servers leave the id out.
          id: toolCall.id || `call_${index}`,
        }));

      const messages: ChatCompletionMessageParam[] = [];
      if (text !== '' || refusal !== '' || streamedToolCalls.length > 0) {
        const message: ChatCompletionAssistantMessageParam & {
          reasoning_details?: unknown[];
        } = {
          role: 'assistant',
          content: text === '' && streamedToolCalls.length > 0 ? null : text,
        };
        if (refusal !== '') {
          message.refusal = refusal;
        }
        if (streamedToolCalls.length > 0) {
          message.tool_calls = streamedToolCalls.map(
            ({ id, name, arguments: args }) => ({
              id,
              type: 'function',
              function: { name, arguments: args },
            })
          );
        }
        if (reasoningDetails.length > 0) {
          message.reasoning_details = reasoningDetails;
        }
        messages.push(message);
      }

      return {
        messages,
        toolCalls: streamedToolCalls.map(({ id, name, arguments: args }) =>
          parseFunctionToolCall(id, name, args)
        ),
        stop: _getStopReason(
          finishReason,
          streamedToolCalls.length > 0,
          refusal !== ''
        ),
        refusalExplanation: refusal === '' ? null : refusal,
      };
    },

    makeToolResultMessages(results) {
      return results.map(({ id, text, isError }) => ({
        role: 'tool',
        tool_call_id: id,
        content:
          isError && !text.startsWith(OPENAI_TOOL_ERROR_PREFIX)
            ? OPENAI_TOOL_ERROR_PREFIX + text
            : text,
      }));
    },

    describeError: (error) => describeOpenAIError(error, name),
  };
}
