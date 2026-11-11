/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers to fake streamed responses from the OpenAI Responses API.
 */

export const TEST_RESPONSES_BASE_URL = 'https://openai-responses.test/v1';
export const RESPONSES_API_URL = `${TEST_RESPONSES_BASE_URL}/responses`;

export type FakeResponsesResponse = {
  // An encrypted reasoning item before the rest of the output.
  reasoning?: { id: string; encryptedContent: string };
  text?: string;
  refusal?: string;
  // `rawArguments` replaces the JSON arguments built from `args`.
  toolCalls?: Array<{
    id: string;
    args?: string;
    name?: string;
    rawArguments?: string;
  }>;
  status: 'completed' | 'incomplete' | 'failed';
  incompleteReason?: 'max_output_tokens' | 'content_filter';
  errorMessage?: string;
};

function _halves(text: string): string[] {
  return [text.slice(0, text.length >> 1), text.slice(text.length >> 1)];
}

/**
 * The SSE body of a streamed Responses API response, with the events the
 * provider uses and the ones around them.
 */
export function makeResponsesSseBody(fake: FakeResponsesResponse): string {
  let sequence = 0;
  let body = '';
  const event = (type: string, data: object) => {
    body += `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`;
  };
  const baseResponse = {
    id: 'resp_test',
    object: 'response',
    model: 'test-model',
    error: null,
    incomplete_details: null,
  };
  event('response.created', {
    response: { ...baseResponse, status: 'in_progress', output: [] },
  });

  const output: object[] = [];
  const addItem = (item: object, emitContent: (index: number) => void) => {
    const outputIndex = output.length;
    event('response.output_item.added', {
      output_index: outputIndex,
      item: { ...item, status: 'in_progress' },
    });
    emitContent(outputIndex);
    const doneItem = { ...item, status: 'completed' };
    event('response.output_item.done', {
      output_index: outputIndex,
      item: doneItem,
    });
    output.push(doneItem);
  };

  if (fake.reasoning) {
    addItem(
      {
        id: fake.reasoning.id,
        type: 'reasoning',
        summary: [],
        encrypted_content: fake.reasoning.encryptedContent,
      },
      () => {}
    );
  }
  if (fake.text !== undefined || fake.refusal !== undefined) {
    const content: object[] = [];
    if (fake.text !== undefined) {
      content.push({ type: 'output_text', text: fake.text, annotations: [] });
    }
    if (fake.refusal !== undefined) {
      content.push({ type: 'refusal', refusal: fake.refusal });
    }
    addItem(
      { id: 'msg_test', type: 'message', role: 'assistant', content },
      (outputIndex) => {
        if (fake.text !== undefined) {
          for (const delta of _halves(fake.text)) {
            event('response.output_text.delta', {
              item_id: 'msg_test',
              output_index: outputIndex,
              content_index: 0,
              delta,
              logprobs: [],
            });
          }
        }
      }
    );
  }
  for (const toolCall of fake.toolCalls ?? []) {
    const args =
      toolCall.rawArguments ?? JSON.stringify({ args: toolCall.args });
    const itemId = `fc_${toolCall.id}`;
    addItem(
      {
        id: itemId,
        type: 'function_call',
        call_id: toolCall.id,
        name: toolCall.name ?? 'run_profiler_cli',
        arguments: args,
      },
      (outputIndex) => {
        for (const delta of _halves(args)) {
          event('response.function_call_arguments.delta', {
            item_id: itemId,
            output_index: outputIndex,
            delta,
          });
        }
      }
    );
  }

  const finalResponse = {
    ...baseResponse,
    status: fake.status,
    output,
    incomplete_details:
      fake.status === 'incomplete'
        ? { reason: fake.incompleteReason ?? 'max_output_tokens' }
        : null,
    error:
      fake.status === 'failed'
        ? { code: 'server_error', message: fake.errorMessage ?? 'Failed' }
        : null,
  };
  event(`response.${fake.status}`, { response: finalResponse });
  return body;
}

export function makeResponsesSseResponse(
  fake: FakeResponsesResponse
): Response {
  return new Response(makeResponsesSseBody(fake), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * Route the Responses API in fetch-mock to answer with `responses`, one per
 * request, and return the parsed request bodies as they come in.
 */
export function mockResponsesApi(
  responses: Array<
    FakeResponsesResponse | (() => Response | Promise<Response>)
  >,
  url: string = RESPONSES_API_URL
): Array<any> {
  const requestBodies: Array<any> = [];
  let index = 0;
  window.fetchMock.post(url, (callLog: any) => {
    requestBodies.push(JSON.parse(callLog.options.body));
    const response = responses[index++];
    if (response === undefined) {
      throw new Error('Unexpected Responses API request');
    }
    return typeof response === 'function'
      ? response()
      : makeResponsesSseResponse(response);
  });
  return requestBodies;
}
