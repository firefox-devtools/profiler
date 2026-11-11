/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers to fake streamed responses from the Anthropic Messages API.
 */

export const MESSAGES_API_URL = 'https://api.anthropic.com/v1/messages';

export type FakeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; signature: string }
  | { type: 'tool_use'; id: string; args: string };

export type FakeResponse = {
  content: FakeContentBlock[];
  stopReason: string;
  stopDetails?: object;
};

function _event(type: string, data: object): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

/**
 * The SSE body of a streamed Messages API response.
 */
export function makeSseBody({
  content,
  stopReason,
  stopDetails,
}: FakeResponse): string {
  let body = _event('message_start', {
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  });
  content.forEach((block, index) => {
    switch (block.type) {
      case 'text':
        body += _event('content_block_start', {
          index,
          content_block: { type: 'text', text: '', citations: null },
        });
        // Split in two deltas to exercise the accumulation.
        for (const part of [
          block.text.slice(0, block.text.length >> 1),
          block.text.slice(block.text.length >> 1),
        ]) {
          body += _event('content_block_delta', {
            index,
            delta: { type: 'text_delta', text: part },
          });
        }
        break;
      case 'thinking':
        body += _event('content_block_start', {
          index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        });
        body += _event('content_block_delta', {
          index,
          delta: { type: 'signature_delta', signature: block.signature },
        });
        break;
      case 'tool_use':
        body += _event('content_block_start', {
          index,
          content_block: {
            type: 'tool_use',
            id: block.id,
            name: 'run_profiler_cli',
            input: {},
          },
        });
        body += _event('content_block_delta', {
          index,
          delta: {
            type: 'input_json_delta',
            partial_json: JSON.stringify({ args: block.args }),
          },
        });
        break;
      default:
        throw new Error('Unknown block type');
    }
    body += _event('content_block_stop', { index });
  });
  body += _event('message_delta', {
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
      stop_details: stopDetails ?? null,
    },
    usage: { output_tokens: 20 },
  });
  body += _event('message_stop', {});
  return body;
}

export function makeSseResponse(response: FakeResponse): Response {
  return new Response(makeSseBody(response), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * Route the Messages API in fetch-mock to answer with `responses`, one per
 * request, and return the parsed request bodies as they come in.
 */
export function mockMessagesApi(
  responses: Array<FakeResponse | (() => Response | Promise<Response>)>
): Array<any> {
  const requestBodies: Array<any> = [];
  let index = 0;
  window.fetchMock.post(MESSAGES_API_URL, (callLog: any) => {
    requestBodies.push(JSON.parse(callLog.options.body));
    const response = responses[index++];
    if (response === undefined) {
      throw new Error('Unexpected Messages API request');
    }
    return typeof response === 'function'
      ? response()
      : makeSseResponse(response);
  });
  return requestBodies;
}
