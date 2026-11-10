/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  runChatTurn,
  MAX_TOOL_ITERATIONS,
  type ToolRunResult,
} from 'firefox-profiler/app-logic/profile-chat/chat-engine';
import { createAnthropicProvider } from 'firefox-profiler/app-logic/profile-chat/providers/anthropic';
import { createOpenAIChatProvider } from 'firefox-profiler/app-logic/profile-chat/providers/openai-chat';
import { createOpenAIResponsesProvider } from 'firefox-profiler/app-logic/profile-chat/providers/openai-responses';
import type {
  ChatProvider,
  ToolResult,
} from 'firefox-profiler/app-logic/profile-chat/providers/types';
import {
  MESSAGES_API_URL,
  mockMessagesApi,
  type FakeContentBlock,
} from '../fixtures/anthropic-api';
import {
  CHAT_COMPLETIONS_URL,
  mockChatCompletionsApi,
  TEST_OPENAI_BASE_URL,
} from '../fixtures/openai-api';
import {
  mockResponsesApi,
  RESPONSES_API_URL,
  TEST_RESPONSES_BASE_URL,
} from '../fixtures/openai-responses-api';

// A response described without a wire format, so the engine tests run against
// both providers.
type NeutralResponse = {
  text?: string;
  toolCalls?: Array<{ id: string; args: string }>;
  stop: 'end' | 'tool-calls' | 'max-tokens' | 'refusal';
};

type FormatHarness = {
  name: string;
  createProvider: () => ChatProvider<any>;
  mock: (
    responses: Array<NeutralResponse | (() => Response | Promise<Response>)>
  ) => Array<any>;
  mockAuthError: () => void;
  // The tool results in the appended messages, without the format.
  getToolResults: (appended: any[]) => ToolResult[];
};

function _getAnthropicStopReason(stop: NeutralResponse['stop']): string {
  switch (stop) {
    case 'end':
      return 'end_turn';
    case 'tool-calls':
      return 'tool_use';
    case 'max-tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      throw new Error('Unknown stop');
  }
}

function _getOpenAIFinishReason(stop: NeutralResponse['stop']): string {
  switch (stop) {
    case 'end':
      return 'stop';
    case 'tool-calls':
      return 'tool_calls';
    case 'max-tokens':
      return 'length';
    case 'refusal':
      return 'content_filter';
    default:
      throw new Error('Unknown stop');
  }
}

const ANTHROPIC: FormatHarness = {
  name: 'anthropic',
  createProvider: () => createAnthropicProvider('sk-test'),
  mock: (responses) =>
    mockMessagesApi(
      responses.map((response) => {
        if (typeof response === 'function') {
          return response;
        }
        const content: FakeContentBlock[] = [];
        if (response.text !== undefined) {
          content.push({ type: 'text', text: response.text });
        }
        for (const { id, args } of response.toolCalls ?? []) {
          content.push({ type: 'tool_use', id, args });
        }
        return { content, stopReason: _getAnthropicStopReason(response.stop) };
      })
    ),
  mockAuthError: () =>
    window.fetchMock.post(MESSAGES_API_URL, {
      status: 401,
      body: {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      },
    }),
  getToolResults: (appended) =>
    appended
      .filter(
        (message) =>
          message.role === 'user' &&
          message.content.some((block: any) => block.type === 'tool_result')
      )
      .flatMap((message) =>
        message.content.map((block: any) => ({
          id: block.tool_use_id,
          text: block.content,
          isError: block.is_error,
        }))
      ),
};

const OPENAI_CHAT: FormatHarness = {
  name: 'openai-chat',
  createProvider: () =>
    createOpenAIChatProvider({
      name: 'Test server',
      baseURL: TEST_OPENAI_BASE_URL,
      apiKey: 'sk-test',
      model: 'test-model',
    }),
  mock: (responses) =>
    mockChatCompletionsApi(
      responses.map((response) =>
        typeof response === 'function'
          ? response
          : {
              text: response.text,
              toolCalls: response.toolCalls,
              finishReason: _getOpenAIFinishReason(response.stop),
            }
      )
    ),
  mockAuthError: () =>
    window.fetchMock.post(CHAT_COMPLETIONS_URL, {
      status: 401,
      body: {
        error: {
          message: 'invalid x-api-key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
    }),
  getToolResults: (appended) =>
    appended
      .filter((message) => message.role === 'tool')
      .map((message) => ({
        id: message.tool_call_id,
        text: message.content.replace(/^Error: /, ''),
        isError: message.content.startsWith('Error: '),
      })),
};

const OPENAI_RESPONSES: FormatHarness = {
  name: 'openai-responses',
  createProvider: () =>
    createOpenAIResponsesProvider({
      name: 'OpenAI',
      baseURL: TEST_RESPONSES_BASE_URL,
      apiKey: 'sk-test',
      model: 'test-model',
    }),
  mock: (responses) =>
    mockResponsesApi(
      responses.map((response) => {
        if (typeof response === 'function') {
          return response;
        }
        switch (response.stop) {
          case 'end':
          case 'tool-calls':
            return {
              text: response.text,
              toolCalls: response.toolCalls,
              status: 'completed',
            };
          case 'max-tokens':
          case 'refusal':
            return {
              text: response.text,
              toolCalls: response.toolCalls,
              status: 'incomplete',
              incompleteReason:
                response.stop === 'refusal'
                  ? 'content_filter'
                  : 'max_output_tokens',
            };
          default:
            throw new Error('Unknown stop');
        }
      })
    ),
  mockAuthError: () =>
    window.fetchMock.post(RESPONSES_API_URL, {
      status: 401,
      body: {
        error: {
          message: 'invalid x-api-key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
    }),
  getToolResults: (appended) =>
    appended
      .filter((item) => item.type === 'function_call_output')
      .map((item) => ({
        id: item.call_id,
        text: item.output.replace(/^Error: /, ''),
        isError: item.output.startsWith('Error: '),
      })),
};

function setup(
  format: FormatHarness,
  runTool?: (args: string) => Promise<ToolRunResult>
) {
  const provider = format.createProvider();
  const history = [provider.makeUserMessage('Why is it slow?', '')];
  const appended: any[] = [];
  const runningTools: boolean[] = [];
  const textDeltas: string[] = [];
  const controller = new AbortController();
  const toolCalls: string[] = [];
  const run = (signal = controller.signal) =>
    runChatTurn({
      provider,
      history,
      runTool: async (args) => {
        toolCalls.push(args);
        return runTool
          ? runTool(args)
          : { text: `ran ${args}`, isError: false };
      },
      signal,
      onTextDelta: (text) => textDeltas.push(text),
      onMessages: (messages, isRunningTools) => {
        appended.push(...messages);
        runningTools.push(isRunningTools);
      },
    });
  return {
    appended,
    runningTools,
    textDeltas,
    controller,
    toolCalls,
    provider,
    run,
  };
}

describe.each([ANTHROPIC, OPENAI_CHAT, OPENAI_RESPONSES])(
  'runChatTurn with $name',
  (format) => {
    it('streams a text-only answer', async function () {
      format.mock([{ text: 'Hello there', stop: 'end' }]);
      const { appended, textDeltas, run } = setup(format);

      expect(await run()).toEqual({ type: 'done' });
      expect(textDeltas).toEqual(['Hello', 'Hello there']);
      expect(appended).toHaveLength(1);
      expect(appended[0].role).toBe('assistant');
    });

    it('runs parallel tool calls and answers all of them', async function () {
      const requests = format.mock([
        {
          text: 'Let me look.',
          toolCalls: [
            { id: 'call_1', args: 'thread list' },
            { id: 'call_2', args: 'thread samples' },
          ],
          stop: 'tool-calls',
        },
        { text: 'GC is hot.', stop: 'end' },
      ]);
      const { appended, runningTools, toolCalls, run } = setup(
        format,
        async (args) =>
          args === 'thread samples'
            ? { text: 'no samples', isError: true }
            : { text: 't-0 GeckoMain', isError: false }
      );

      expect(await run()).toEqual({ type: 'done' });
      expect(toolCalls).toEqual(['thread list', 'thread samples']);
      expect(runningTools).toEqual([true, false, false]);
      expect(format.getToolResults(appended)).toEqual([
        { id: 'call_1', text: 't-0 GeckoMain', isError: false },
        { id: 'call_2', text: 'no samples', isError: true },
      ]);
      // The second request carries the whole conversation.
      const secondRequestMessages = (
        requests[1].messages ?? requests[1].input
      ).filter((message: any) => message.role !== 'system');
      expect(secondRequestMessages).toHaveLength(1 + appended.length - 1);
    });

    it('reports a thrown tool as an error result', async function () {
      format.mock([
        {
          toolCalls: [{ id: 'call_1', args: 'profile info' }],
          stop: 'tool-calls',
        },
        { text: 'ok', stop: 'end' },
      ]);
      const { appended, run } = setup(format, async () => {
        throw new Error('boom');
      });
      await run();
      expect(format.getToolResults(appended)).toEqual([
        { id: 'call_1', text: expect.stringContaining('boom'), isError: true },
      ]);
    });

    it('stops after too many tool iterations, answering the last tool calls', async function () {
      format.mock(
        Array.from({ length: MAX_TOOL_ITERATIONS }, () => ({
          toolCalls: [{ id: 'call_x', args: 'profile info' }],
          stop: 'tool-calls' as const,
        }))
      );
      const { appended, toolCalls, run } = setup(format);

      expect(await run()).toEqual({ type: 'tool-limit' });
      expect(toolCalls).toHaveLength(MAX_TOOL_ITERATIONS - 1);
      expect(format.getToolResults(appended).at(-1)).toEqual({
        id: 'call_x',
        text: 'Stopped: too many tool calls for one message.',
        isError: true,
      });
    });

    it('answers tool calls that were cut off', async function () {
      format.mock([
        {
          text: 'A long answ',
          toolCalls: [{ id: 'call_1', args: 'profile info' }],
          stop: 'max-tokens',
        },
      ]);
      const { appended, toolCalls, run } = setup(format);
      expect(await run()).toEqual({ type: 'max-tokens' });
      expect(toolCalls).toEqual([]);
      expect(format.getToolResults(appended)).toEqual([
        {
          id: 'call_1',
          text: expect.stringContaining('cut off'),
          isError: true,
        },
      ]);
    });

    it('cancels while the response is streaming', async function () {
      const { controller, appended, run } = setup(format);
      format.mock([
        () => {
          controller.abort();
          return new Promise(() => {});
        },
      ]);
      expect(await run()).toEqual({ type: 'cancelled' });
      expect(appended).toEqual([]);
    });

    it('keeps the history valid when cancelled between tool calls', async function () {
      format.mock([
        {
          toolCalls: [
            { id: 'call_1', args: 'thread list' },
            { id: 'call_2', args: 'thread samples' },
          ],
          stop: 'tool-calls',
        },
      ]);
      const { controller, appended, toolCalls, run } = setup(
        format,
        async () => {
          controller.abort();
          return { text: 'done', isError: false };
        }
      );

      expect(await run()).toEqual({ type: 'cancelled' });
      expect(toolCalls).toEqual(['thread list']);
      expect(format.getToolResults(appended)).toEqual([
        { id: 'call_1', text: 'done', isError: false },
        { id: 'call_2', text: 'Cancelled by the user.', isError: true },
      ]);
    });

    it('throws API errors that the provider can explain', async function () {
      format.mockAuthError();
      const { provider, run } = setup(format);
      const error = await run().catch((e) => e);
      expect(provider.describeError(error)).toEqual({
        type: 'auth',
        provider: expect.any(String),
        message: 'invalid x-api-key',
      });
    });
  }
);

describe('the Anthropic provider', function () {
  it('sends the expected request', async function () {
    const requests = ANTHROPIC.mock([{ text: 'Hello', stop: 'end' }]);
    const { appended, run } = setup(ANTHROPIC);
    await run();

    // Serialized like the next request will be, which also skips the SDK's
    // non-enumerable helper properties.
    expect(JSON.parse(JSON.stringify(appended))).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello', citations: null }],
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
    expect(request.cache_control).toEqual({ type: 'ephemeral' });
    expect(request.system.at(-2).text).toContain('profiler-cli');

    const call = window.fetchMock.callHistory.lastCall(MESSAGES_API_URL);
    const headers = call?.options.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
  });

  it('sends thinking blocks back unchanged, with all results in one message', async function () {
    const requests = mockMessagesApi([
      {
        content: [
          { type: 'thinking', signature: 'sig-1' },
          { type: 'tool_use', id: 'toolu_1', args: 'thread list' },
          { type: 'tool_use', id: 'toolu_2', args: 'thread samples' },
        ],
        stopReason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' },
    ]);
    const { appended, run } = setup(ANTHROPIC);
    await run();

    expect(appended[1].content).toHaveLength(2);
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

  it('reports the refusal explanation', async function () {
    mockMessagesApi([
      {
        content: [],
        stopReason: 'refusal',
        stopDetails: { type: 'refusal', category: null, explanation: 'Nope.' },
      },
    ]);
    const { run } = setup(ANTHROPIC);
    expect(await run()).toEqual({ type: 'refusal', explanation: 'Nope.' });
  });
});

describe('the OpenAI-compatible provider', function () {
  function setupOpenAI({
    runTool,
  }: {
    runTool?: (args: string) => Promise<ToolRunResult>;
  } = {}) {
    return setup(
      {
        ...OPENAI_CHAT,
        createProvider: () =>
          createOpenAIChatProvider({
            name: 'Test server',
            baseURL: TEST_OPENAI_BASE_URL,
            apiKey: 'sk-test',
            model: 'test-model',
          }),
      },
      runTool
    );
  }

  it('sends the expected request', async function () {
    const requests = mockChatCompletionsApi([
      { text: 'Hello', finishReason: 'stop' },
    ]);
    const { appended, run } = setupOpenAI();
    await run();

    expect(appended).toEqual([{ role: 'assistant', content: 'Hello' }]);
    const [request] = requests;
    expect(request.model).toBe('test-model');
    expect(request.stream).toBe(true);
    expect(request.messages[0].role).toBe('system');
    expect(request.messages[0].content).toContain('profiler-cli');
    expect(request.messages[1]).toEqual({
      role: 'user',
      content: 'Why is it slow?\n\n',
    });
    expect(request.tools).toEqual([
      {
        type: 'function',
        function: expect.objectContaining({ name: 'run_profiler_cli' }),
      },
    ]);
    expect(request.tools[0].function.strict).toBeUndefined();

    const call = window.fetchMock.callHistory.lastCall(CHAT_COMPLETIONS_URL);
    const headers = call?.options.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test');
  });

  it('assembles tool calls split across chunks', async function () {
    const requests = mockChatCompletionsApi([
      {
        toolCalls: [
          { id: 'call_1', args: 'thread select t-1' },
          { id: 'call_2', args: 'zoom push "1s,2s"' },
        ],
        finishReason: 'tool_calls',
      },
      { text: 'Done.', finishReason: 'stop' },
    ]);
    const { appended, toolCalls, run } = setupOpenAI();
    await run();

    expect(toolCalls).toEqual(['thread select t-1', 'zoom push "1s,2s"']);
    expect(appended[0]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'run_profiler_cli',
            arguments: '{"args":"thread select t-1"}',
          },
        },
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'run_profiler_cli',
            arguments: '{"args":"zoom push \\"1s,2s\\""}',
          },
        },
      ],
    });
    expect(appended.slice(1, 3)).toEqual([
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'ran thread select t-1',
      },
      {
        role: 'tool',
        tool_call_id: 'call_2',
        content: 'ran zoom push "1s,2s"',
      },
    ]);
    expect(requests[1].messages.slice(1)).toEqual([
      expect.objectContaining({ role: 'user' }),
      ...appended.slice(0, 3),
    ]);
  });

  it('answers unparseable arguments and unknown tools with an error', async function () {
    mockChatCompletionsApi([
      {
        toolCalls: [
          { id: 'call_1', rawArguments: '{"args": "thread' },
          { id: 'call_2', name: 'other_tool', args: 'x' },
        ],
        finishReason: 'tool_calls',
      },
      { text: 'Sorry.', finishReason: 'stop' },
    ]);
    const { appended, toolCalls, run } = setupOpenAI();
    expect(await run()).toEqual({ type: 'done' });
    expect(toolCalls).toEqual([]);
    expect(appended.slice(1, 3)).toEqual([
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'Error: Unknown tool or invalid input: run_profiler_cli',
      },
      {
        role: 'tool',
        tool_call_id: 'call_2',
        content: 'Error: Unknown tool or invalid input: other_tool',
      },
    ]);
  });

  it('gives tool calls without an id ids that are unique across turns', async function () {
    mockChatCompletionsApi([
      { toolCalls: [{ args: 'profile info' }], finishReason: 'tool_calls' },
      { text: 'Done.', finishReason: 'stop' },
      { toolCalls: [{ args: 'thread list' }], finishReason: 'tool_calls' },
      { text: 'Done.', finishReason: 'stop' },
    ]);
    const { appended, run } = setupOpenAI();
    await run();
    await run();

    const toolCallIds = appended
      .filter((message) => message.role === 'assistant' && message.tool_calls)
      .map((message) => message.tool_calls[0].id);
    const toolResultIds = appended
      .filter((message) => message.role === 'tool')
      .map((message) => message.tool_call_id);
    expect(toolCallIds).toHaveLength(2);
    expect(new Set(toolCallIds).size).toBe(2);
    expect(toolResultIds).toEqual(toolCallIds);
  });

  it('sends user messages without a reply in between as one', async function () {
    const requests = mockChatCompletionsApi([
      { text: 'Hello', finishReason: 'stop' },
    ]);
    const provider = createOpenAIChatProvider({
      name: 'Test server',
      baseURL: TEST_OPENAI_BASE_URL,
      apiKey: 'sk-test',
      model: 'test-model',
    });
    await runChatTurn({
      provider,
      history: [
        provider.makeUserMessage('Why is it slow?', 'View A'),
        provider.makeUserMessage('What about the GC?', 'View B'),
      ],
      runTool: async () => ({ text: '', isError: false }),
      signal: new AbortController().signal,
      onTextDelta: () => {},
      onMessages: () => {},
    });

    expect(requests[0].messages.slice(1)).toEqual([
      {
        role: 'user',
        content: 'Why is it slow?\n\nView A\n\nWhat about the GC?\n\nView B',
      },
    ]);
  });

  it('runs tool calls that end with finish_reason "stop"', async function () {
    mockChatCompletionsApi([
      {
        toolCalls: [{ id: 'call_1', args: 'profile info' }],
        finishReason: 'stop',
      },
      { text: 'Done.', finishReason: 'stop' },
    ]);
    const { toolCalls, run } = setupOpenAI();
    expect(await run()).toEqual({ type: 'done' });
    expect(toolCalls).toEqual(['profile info']);
  });

  it('treats content_filter as a refusal without explanation', async function () {
    mockChatCompletionsApi([{ finishReason: 'content_filter' }]);
    const { appended, run } = setupOpenAI();
    expect(await run()).toEqual({ type: 'refusal', explanation: null });
    // Nothing to append for an empty response.
    expect(appended).toEqual([]);
  });

  it('keeps OpenRouter reasoning details for the next request', async function () {
    const reasoningDetails = [
      { type: 'reasoning.encrypted', data: 'abc', id: 'r1', index: 0 },
    ];
    const requests = mockChatCompletionsApi([
      {
        toolCalls: [{ id: 'call_1', args: 'profile info' }],
        finishReason: 'tool_calls',
        reasoningDetails,
      },
      { text: 'Done.', finishReason: 'stop' },
    ]);
    await setupOpenAI().run();
    expect(requests[1].messages[2].reasoning_details).toEqual(reasoningDetails);
  });

  it('describes connection errors with the provider name', async function () {
    window.fetchMock.post(CHAT_COMPLETIONS_URL, {
      throws: new TypeError('Failed to fetch'),
    });
    const provider = createOpenAIChatProvider({
      name: 'localhost:11434',
      baseURL: TEST_OPENAI_BASE_URL,
      apiKey: null,
      model: 'test-model',
    });
    const error = await provider
      .streamResponse([], new AbortController().signal, () => {})
      .catch((e) => e);
    expect(provider.describeError(error)).toEqual({
      type: 'connection',
      provider: 'localhost:11434',
      message: expect.any(String),
    });
  });
});

describe('the OpenAI Responses provider', function () {
  it('sends the expected request', async function () {
    const requests = mockResponsesApi([{ text: 'Hello', status: 'completed' }]);
    const { appended, run } = setup(OPENAI_RESPONSES);
    expect(await run()).toEqual({ type: 'done' });

    expect(appended).toEqual([
      expect.objectContaining({
        type: 'message',
        role: 'assistant',
        content: [
          expect.objectContaining({ type: 'output_text', text: 'Hello' }),
        ],
      }),
    ]);
    const [request] = requests;
    expect(request.model).toBe('test-model');
    expect(request.stream).toBe(true);
    expect(request.store).toBe(false);
    expect(request.include).toEqual(['reasoning.encrypted_content']);
    // The model's default effort, which is what Chat Completions rejects
    // together with tools for some models.
    expect(request.reasoning).toBeUndefined();
    expect(request.instructions).toContain('profiler-cli');
    expect(request.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Why is it slow?' },
          { type: 'input_text', text: '' },
        ],
      },
    ]);
    expect(request.tools).toEqual([
      expect.objectContaining({
        type: 'function',
        name: 'run_profiler_cli',
        strict: true,
      }),
    ]);
  });

  it('sends encrypted reasoning back with the function calls', async function () {
    const requests = mockResponsesApi([
      {
        reasoning: { id: 'rs_1', encryptedContent: 'gAAAA-secret' },
        toolCalls: [
          { id: 'call_1', args: 'thread list' },
          { id: 'call_2', args: 'thread samples' },
        ],
        status: 'completed',
      },
      { text: 'Done.', status: 'completed' },
    ]);
    const { appended, toolCalls, run } = setup(OPENAI_RESPONSES);
    expect(await run()).toEqual({ type: 'done' });
    expect(toolCalls).toEqual(['thread list', 'thread samples']);

    const second = requests[1].input;
    expect(second).toHaveLength(6);
    expect(second[1]).toEqual({
      id: 'rs_1',
      type: 'reasoning',
      summary: [],
      encrypted_content: 'gAAAA-secret',
      status: 'completed',
    });
    expect(second[2]).toMatchObject({
      type: 'function_call',
      call_id: 'call_1',
      arguments: '{"args":"thread list"}',
    });
    expect(second.slice(4)).toEqual([
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'ran thread list',
      },
      {
        type: 'function_call_output',
        call_id: 'call_2',
        output: 'ran thread samples',
      },
    ]);
    expect(second).toEqual(
      JSON.parse(
        JSON.stringify([requests[0].input[0], ...appended.slice(0, 5)])
      )
    );
  });

  it('answers unparseable arguments with an error', async function () {
    mockResponsesApi([
      {
        toolCalls: [{ id: 'call_1', rawArguments: '{"args": "thr' }],
        status: 'completed',
      },
      { text: 'Sorry.', status: 'completed' },
    ]);
    const { appended, toolCalls, run } = setup(OPENAI_RESPONSES);
    await run();
    expect(toolCalls).toEqual([]);
    expect(appended[1]).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'Error: Unknown tool or invalid input: run_profiler_cli',
    });
  });

  it('reports refusals with their explanation', async function () {
    mockResponsesApi([{ refusal: 'I can not help.', status: 'completed' }]);
    const { run } = setup(OPENAI_RESPONSES);
    expect(await run()).toEqual({
      type: 'refusal',
      explanation: 'I can not help.',
    });
  });

  it('throws when the response failed', async function () {
    mockResponsesApi([{ status: 'failed', errorMessage: 'Server exploded' }]);
    const { provider, run } = setup(OPENAI_RESPONSES);
    const error = await run().catch((e) => e);
    expect(provider.describeError(error)).toEqual({
      type: 'unknown',
      message: 'Server exploded',
    });
  });
});
