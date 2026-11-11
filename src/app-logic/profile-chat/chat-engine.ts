/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The agentic loop behind the profile chat. It knows nothing about Redux or
 * about a particular API: it streams one user turn through a ChatProvider,
 * runs the tool calls the model asks for, and reports every message it adds
 * to the conversation.
 *
 * The conversation must stay append-only. Earlier messages, including their
 * thinking blocks, are sent back unchanged, and every tool call gets a
 * matching result, even when the turn is cancelled or cut short.
 */

import type { ChatTurnOutcome } from 'firefox-profiler/types';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type {
  ChatProvider,
  ProviderResponse,
  ToolCall,
  ToolResult,
} from './providers/types';

// Tool rounds allowed for one user message before the turn is stopped.
export const MAX_TOOL_ITERATIONS = 25;

export type ToolRunResult = {
  text: string;
  isError: boolean;
};

export type RunChatTurnOptions<M> = {
  provider: ChatProvider<M>;
  /** The conversation so far, ending with the new user message. */
  history: M[];
  /** Runs one profiler-cli command line. */
  runTool: (args: string) => Promise<ToolRunResult>;
  signal: AbortSignal;
  /** Called with the visible text streamed so far for the current response. */
  onTextDelta: (text: string) => void;
  /**
   * Called with the messages appended to the conversation. `isRunningTools`
   * is true when the tool calls of these messages are about to run.
   */
  onMessages: (messages: M[], isRunningTools: boolean) => void;
};

function _errorResult(toolCall: ToolCall, text: string): ToolResult {
  return { id: toolCall.id, text, isError: true };
}

/**
 * Run one user turn to completion: stream the response, run the requested
 * tools, and repeat until the model ends its turn or the turn is stopped.
 * API errors are thrown, except for an abort through `signal`, which ends the
 * turn as cancelled.
 */
export async function runChatTurn<M>({
  provider,
  history,
  runTool,
  signal,
  onTextDelta,
  onMessages,
}: RunChatTurnOptions<M>): Promise<ChatTurnOutcome> {
  const messages = history.slice();
  const append = (appended: M[], isRunningTools: boolean) => {
    if (appended.length > 0) {
      messages.push(...appended);
      onMessages(appended, isRunningTools);
    }
  };
  const answer = (results: ToolResult[]) =>
    append(provider.makeToolResultMessages(results), false);
  // Every tool call needs a result, even when we stop.
  const answerAllWithError = (toolCalls: ToolCall[], text: string) =>
    answer(toolCalls.map((toolCall) => _errorResult(toolCall, text)));

  for (let iteration = 0; ; iteration++) {
    let response: ProviderResponse<M>;
    try {
      response = await provider.streamResponse(messages, signal, onTextDelta);
    } catch (error) {
      if (signal.aborted) {
        return { type: 'cancelled' };
      }
      throw error;
    }

    const { toolCalls } = response;
    const isLastIteration = iteration + 1 >= MAX_TOOL_ITERATIONS;
    append(
      response.messages,
      response.stop === 'tool-calls' && !isLastIteration
    );

    switch (response.stop) {
      case 'tool-calls':
        break;
      case 'max-tokens':
        answerAllWithError(
          toolCalls,
          'The response was cut off before this tool call was complete.'
        );
        return { type: 'max-tokens' };
      case 'refusal':
        answerAllWithError(toolCalls, 'The response was declined.');
        return { type: 'refusal', explanation: response.refusalExplanation };
      case 'end':
        answerAllWithError(toolCalls, 'This tool call was not run.');
        return { type: 'done' };
      default:
        throw assertExhaustiveCheck(response.stop);
    }

    if (isLastIteration) {
      answerAllWithError(
        toolCalls,
        'Stopped: too many tool calls for one message.'
      );
      return { type: 'tool-limit' };
    }

    // Run sequentially: the commands share the store, and some change it.
    const results: ToolResult[] = [];
    for (const toolCall of toolCalls) {
      if (signal.aborted) {
        results.push(_errorResult(toolCall, 'Cancelled by the user.'));
        continue;
      }
      if (toolCall.args === null) {
        results.push(
          _errorResult(
            toolCall,
            `Unknown tool or invalid input: ${toolCall.name}`
          )
        );
        continue;
      }
      try {
        const { text, isError } = await runTool(toolCall.args);
        results.push({
          id: toolCall.id,
          text: text === '' ? '(no output)' : text,
          isError,
        });
      } catch (error) {
        results.push(_errorResult(toolCall, `Error: ${error.message}`));
      }
    }
    answer(results);

    if (signal.aborted) {
      return { type: 'cancelled' };
    }
  }
}
