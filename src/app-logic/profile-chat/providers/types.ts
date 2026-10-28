/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The interface between the provider-neutral chat engine and one wire format.
 * Each provider keeps its own message format, `M`, in the conversation, so
 * nothing is translated and earlier messages are sent back unchanged.
 */

import type { ChatError } from 'firefox-profiler/types';

export type ToolCall = {
  readonly id: string;
  // The tool name the model used, for the error message when it's unknown.
  readonly name: string;
  // The profiler-cli command line, or null when the input couldn't be parsed
  // or the model called a tool that doesn't exist.
  readonly args: string | null;
};

export type ToolResult = {
  readonly id: string;
  readonly text: string;
  readonly isError: boolean;
};

export type ProviderStopReason =
  | 'end'
  | 'tool-calls'
  | 'max-tokens'
  | 'refusal';

export type ProviderResponse<M> = {
  // The messages to append for this response, as the provider returned them.
  readonly messages: M[];
  readonly toolCalls: ToolCall[];
  readonly stop: ProviderStopReason;
  readonly refusalExplanation: string | null;
};

export interface ChatProvider<M> {
  makeUserMessage(text: string, viewContext: string): M;
  /**
   * Stream one response for `history`. `onText` is called with the visible
   * text streamed so far. Errors are thrown, including the abort error when
   * `signal` is aborted.
   */
  streamResponse(
    history: M[],
    signal: AbortSignal,
    onText: (text: string) => void
  ): Promise<ProviderResponse<M>>;
  // The messages answering the tool calls of the last response.
  makeToolResultMessages(results: ToolResult[]): M[];
  // Classify an error thrown by streamResponse for display.
  describeError(error: unknown): ChatError;
}

export function describeUnknownChatError(error: unknown): ChatError {
  return {
    type: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  };
}
