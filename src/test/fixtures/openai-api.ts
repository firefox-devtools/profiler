/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers to fake streamed responses from an OpenAI-compatible Chat
 * Completions endpoint.
 */

export const TEST_OPENAI_BASE_URL = 'https://openai.test/v1';
export const CHAT_COMPLETIONS_URL = `${TEST_OPENAI_BASE_URL}/chat/completions`;

export type FakeChatCompletion = {
  text?: string;
  // `rawArguments` replaces the JSON arguments built from `args`. Without an
  // `id`, the tool call is sent without one, like some servers do.
  toolCalls?: Array<{
    id?: string;
    args?: string;
    name?: string;
    rawArguments?: string;
  }>;
  finishReason: string | null;
  refusal?: string;
  reasoningDetails?: object[];
};

function _chunk(delta: object, finishReason: string | null = null): string {
  const chunk = {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'test-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function _halves(text: string): string[] {
  return [text.slice(0, text.length >> 1), text.slice(text.length >> 1)];
}

/**
 * The SSE body of a streamed Chat Completions response. Text and tool call
 * arguments are split over several chunks, like real servers do.
 */
export function makeChatCompletionSseBody({
  text,
  toolCalls = [],
  finishReason,
  refusal,
  reasoningDetails,
}: FakeChatCompletion): string {
  let body = _chunk({ role: 'assistant', content: '' });
  if (reasoningDetails) {
    for (const detail of reasoningDetails) {
      body += _chunk({ reasoning_details: [detail] });
    }
  }
  if (text !== undefined) {
    for (const part of _halves(text)) {
      body += _chunk({ content: part });
    }
  }
  if (refusal !== undefined) {
    body += _chunk({ refusal });
  }
  toolCalls.forEach((toolCall, index) => {
    const args =
      toolCall.rawArguments ?? JSON.stringify({ args: toolCall.args });
    const [first, second] = _halves(args);
    body += _chunk({
      tool_calls: [
        {
          index,
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name ?? 'run_profiler_cli',
            arguments: first,
          },
        },
      ],
    });
    body += _chunk({
      tool_calls: [{ index, function: { arguments: second } }],
    });
  });
  body += _chunk({}, finishReason);
  // Real servers end with 'data: [DONE]', but the SDK then cancels the body,
  // which never settles with the Response in the test environment.
  return body;
}

export function makeChatCompletionSseResponse(
  response: FakeChatCompletion
): Response {
  return new Response(makeChatCompletionSseBody(response), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * Route the Chat Completions endpoint in fetch-mock to answer with
 * `responses`, one per request, and return the parsed request bodies as they
 * come in.
 */
export function mockChatCompletionsApi(
  responses: Array<FakeChatCompletion | (() => Response | Promise<Response>)>,
  url: string = CHAT_COMPLETIONS_URL
): Array<any> {
  const requestBodies: Array<any> = [];
  let index = 0;
  window.fetchMock.post(url, (callLog: any) => {
    requestBodies.push(JSON.parse(callLog.options.body));
    const response = responses[index++];
    if (response === undefined) {
      throw new Error('Unexpected Chat Completions request');
    }
    return typeof response === 'function'
      ? response()
      : makeChatCompletionSseResponse(response);
  });
  return requestBodies;
}
