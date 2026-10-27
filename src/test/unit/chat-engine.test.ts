/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  createChatClient,
  describeChatError,
  runChatTurn,
  MAX_TOOL_ITERATIONS,
  type ToolRunResult,
} from 'firefox-profiler/app-logic/profile-chat/chat-engine';
import { MESSAGES_API_URL, mockMessagesApi } from '../fixtures/anthropic-api';

describe('runChatTurn', function () {
  function setup(runTool?: (args: string) => Promise<ToolRunResult>) {
    const history: BetaMessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: 'Why is it slow?' }] },
    ];
    const appended: BetaMessageParam[] = [];
    const textDeltas: string[] = [];
    const controller = new AbortController();
    const toolCalls: string[] = [];
    const run = (signal = controller.signal) =>
      runChatTurn({
        client: createChatClient('sk-test'),
        history,
        runTool: async (args) => {
          toolCalls.push(args);
          return runTool
            ? runTool(args)
            : { text: `ran ${args}`, isError: false };
        },
        signal,
        onTextDelta: (text) => textDeltas.push(text),
        onMessage: (message) => appended.push(message),
      });
    return { history, appended, textDeltas, controller, toolCalls, run };
  }

  it('streams a text-only answer', async function () {
    const requests = mockMessagesApi([
      {
        content: [{ type: 'text', text: 'Hello there' }],
        stopReason: 'end_turn',
      },
    ]);
    const { appended, textDeltas, run } = setup();

    expect(await run()).toEqual({ type: 'done' });
    expect(textDeltas).toEqual(['Hello', 'Hello there']);
    // Serialized like the next request will be, which also skips the SDK's
    // non-enumerable helper properties.
    expect(JSON.parse(JSON.stringify(appended))).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there', citations: null }],
      },
    ]);

    const [request] = requests;
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.output_config).toEqual({ effort: 'medium' });
    expect(request.fallbacks).toBe('default');
    expect(request.thinking).toBeUndefined();
    expect(request.tools).toEqual([
      expect.objectContaining({ name: 'run_profiler_cli', strict: true }),
    ]);
    expect(request.system.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(request.system.at(-2).text).toContain('profiler-cli');

    const call = window.fetchMock.callHistory.lastCall(MESSAGES_API_URL);
    const headers = call?.options.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
  });

  it('runs parallel tool calls and sends all results in one message', async function () {
    const requests = mockMessagesApi([
      {
        content: [
          { type: 'thinking', signature: 'sig-1' },
          { type: 'text', text: 'Let me look.' },
          { type: 'tool_use', id: 'toolu_1', args: 'thread list' },
          { type: 'tool_use', id: 'toolu_2', args: 'thread samples' },
        ],
        stopReason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'GC is hot.' }],
        stopReason: 'end_turn',
      },
    ]);
    const { appended, toolCalls, run } = setup(async (args) =>
      args === 'thread samples'
        ? { text: 'Error: no samples', isError: true }
        : { text: 't-0 GeckoMain', isError: false }
    );

    expect(await run()).toEqual({ type: 'done' });
    expect(toolCalls).toEqual(['thread list', 'thread samples']);
    expect(appended).toHaveLength(3);
    expect(appended[1]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_1',
          content: 't-0 GeckoMain',
          is_error: false,
        },
        {
          type: 'tool_result',
          tool_use_id: 'toolu_2',
          content: 'Error: no samples',
          is_error: true,
        },
      ],
    });

    // The second request carries the first response unchanged, thinking
    // block included, followed by the tool results.
    const second = requests[1];
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1].content[0]).toMatchObject({
      type: 'thinking',
      signature: 'sig-1',
    });
    expect(second.messages[2]).toEqual(appended[1]);
    // The cached prefix doesn't change between requests.
    expect(second.system).toEqual(requests[0].system);
    expect(second.tools).toEqual(requests[0].tools);
  });

  it('reports a thrown tool as an error result', async function () {
    mockMessagesApi([
      {
        content: [{ type: 'tool_use', id: 'toolu_1', args: 'profile info' }],
        stopReason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' },
    ]);
    const { appended, run } = setup(async () => {
      throw new Error('boom');
    });
    await run();
    expect(appended[1].content).toEqual([
      expect.objectContaining({ content: 'Error: boom', is_error: true }),
    ]);
  });

  it('stops after too many tool iterations, answering the last tool calls', async function () {
    const toolResponse = {
      content: [
        { type: 'tool_use' as const, id: 'toolu_x', args: 'profile info' },
      ],
      stopReason: 'tool_use',
    };
    mockMessagesApi(
      Array.from({ length: MAX_TOOL_ITERATIONS }, () => toolResponse)
    );
    const { appended, toolCalls, run } = setup();

    expect(await run()).toEqual({ type: 'tool-limit' });
    expect(toolCalls).toHaveLength(MAX_TOOL_ITERATIONS - 1);
    expect(appended.at(-1)).toEqual({
      role: 'user',
      content: [
        expect.objectContaining({ tool_use_id: 'toolu_x', is_error: true }),
      ],
    });
  });

  it('handles max_tokens and refusals', async function () {
    mockMessagesApi([
      {
        content: [{ type: 'text', text: 'A long answ' }],
        stopReason: 'max_tokens',
      },
      {
        content: [],
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: null, explanation: 'Nope.' },
      },
    ]);
    const first = setup();
    expect(await first.run()).toEqual({ type: 'max-tokens' });
    const second = setup();
    expect(await second.run()).toEqual({
      type: 'refusal',
      explanation: 'Nope.',
    });
  });

  it('cancels while the response is streaming', async function () {
    const { controller, appended, run } = setup();
    mockMessagesApi([
      () => {
        controller.abort();
        return new Promise(() => {});
      },
    ]);
    expect(await run()).toEqual({ type: 'cancelled' });
    expect(appended).toEqual([]);
  });

  it('keeps the history valid when cancelled between tool calls', async function () {
    mockMessagesApi([
      {
        content: [
          { type: 'tool_use', id: 'toolu_1', args: 'thread list' },
          { type: 'tool_use', id: 'toolu_2', args: 'thread samples' },
        ],
        stopReason: 'tool_use',
      },
    ]);
    const { controller, appended, toolCalls, run } = setup(async () => {
      controller.abort();
      return { text: 'done', isError: false };
    });

    expect(await run()).toEqual({ type: 'cancelled' });
    expect(toolCalls).toEqual(['thread list']);
    expect(appended[1].content).toEqual([
      expect.objectContaining({ tool_use_id: 'toolu_1', is_error: false }),
      expect.objectContaining({
        tool_use_id: 'toolu_2',
        content: 'Cancelled by the user.',
        is_error: true,
      }),
    ]);
  });

  it('throws API errors that describeChatError can explain', async function () {
    window.fetchMock.post(MESSAGES_API_URL, {
      status: 401,
      body: {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      },
    });
    const { run } = setup();
    const error = await run().catch((e) => e);
    expect(describeChatError(error)).toEqual({
      message: 'The API key was rejected. Enter a valid Anthropic API key.',
      isAuthError: true,
    });
  });
});
