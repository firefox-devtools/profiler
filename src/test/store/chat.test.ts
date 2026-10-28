/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  cancelChatTurn,
  closeChat,
  forgetChatApiKey,
  openChat,
  resetChat,
  saveChatProviderSettings,
  sendChatMessage,
} from 'firefox-profiler/actions/chat';
import {
  getChatConversation,
  getChatError,
  getChatHasCredentials,
  getChatNotice,
  getChatProviderPreset,
  getChatStatus,
  getChatTranscript,
  getIsChatOpen,
} from 'firefox-profiler/selectors/chat';
import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { MESSAGES_API_URL, mockMessagesApi } from '../fixtures/anthropic-api';
import {
  mockChatCompletionsApi,
  TEST_OPENAI_BASE_URL,
} from '../fixtures/openai-api';

describe('profile chat', function () {
  function setup() {
    const { profile } = getProfileFromTextSamples(
      `
        A    A    A
        B    B    C
      `,
      `
        X    X
        Ygc  Ygc
      `
    );
    profile.threads[0].name = 'GeckoMain';
    profile.threads[1].name = 'DOM Worker';
    const store = storeWithProfile(profile);
    store.dispatch(
      saveChatProviderSettings('anthropic', { apiKey: 'sk-test' })
    );
    return store;
  }

  afterEach(function () {
    window.localStorage.clear();
  });

  it('opens, closes and stores the settings', function () {
    const store = setup();
    expect(getIsChatOpen(store.getState())).toBe(false);
    store.dispatch(openChat());
    expect(getIsChatOpen(store.getState())).toBe(true);
    store.dispatch(closeChat());
    expect(getIsChatOpen(store.getState())).toBe(false);

    expect(getChatHasCredentials(store.getState())).toBe(true);
    expect(window.localStorage.getItem('profiler.chat.provider')).toBe(
      'anthropic'
    );
    expect(
      JSON.parse(
        window.localStorage.getItem('profiler.chat.settings.anthropic') ?? ''
      )
    ).toEqual({ apiKey: 'sk-test' });
    store.dispatch(forgetChatApiKey('anthropic'));
    expect(getChatHasCredentials(store.getState())).toBe(false);
    expect(
      JSON.parse(
        window.localStorage.getItem('profiler.chat.settings.anthropic') ?? ''
      )
    ).toEqual({});
  });

  it('runs a full turn against the live store', async function () {
    const store = setup();
    const requests = mockMessagesApi([
      {
        content: [
          { type: 'tool_use', id: 'toolu_1', args: 'thread select t-1' },
          { type: 'tool_use', id: 'toolu_2', args: 'thread functions' },
        ],
        stopReason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'Ygc takes all the time.' }],
        stopReason: 'end_turn',
      },
    ]);

    await store.dispatch(sendChatMessage('What is the worker doing?'));

    expect(getChatStatus(store.getState())).toBe('idle');
    expect(getChatError(store.getState())).toBeNull();
    // The model's thread select changed the UI.
    expect(getSelectedThreadIndexes(store.getState())).toEqual(new Set([1]));

    const transcript = getChatTranscript(store.getState());
    expect(transcript).toEqual([
      { type: 'user', text: 'What is the worker doing?' },
      {
        type: 'tool-call',
        id: 'toolu_1',
        command: 'thread select t-1',
        result: { text: expect.stringContaining('t-1'), isError: false },
      },
      {
        type: 'tool-call',
        id: 'toolu_2',
        command: 'thread functions',
        result: { text: expect.stringContaining('Ygc'), isError: false },
      },
      { type: 'assistant', text: 'Ygc takes all the time.' },
    ]);

    // The user message carries the view context, which isn't rendered.
    const userText = requests[0].messages[0].content[1].text;
    expect(userText).toContain('<current_view>');
    expect(userText).toContain('Selected tab: calltree');
    expect(userText).toContain('GeckoMain');
    expect(requests[1].messages).toEqual(
      JSON.parse(
        JSON.stringify(
          getChatConversation(store.getState()).messages.slice(0, 3)
        )
      )
    );
  });

  it('shows a notice when stopped', async function () {
    const store = setup();
    mockMessagesApi([
      () => {
        store.dispatch(cancelChatTurn());
        return new Promise(() => {});
      },
    ]);
    await store.dispatch(sendChatMessage('Hi'));
    expect(getChatStatus(store.getState())).toBe('idle');
    expect(getChatNotice(store.getState())).toEqual({ type: 'cancelled' });
    // Only the user message, so the next message continues a valid history.
    expect(getChatConversation(store.getState()).messages).toHaveLength(1);
  });

  it('drops a running turn when the chat is reset', async function () {
    const store = setup();
    mockMessagesApi([
      () => {
        store.dispatch(resetChat());
        return new Promise(() => {});
      },
    ]);
    await store.dispatch(sendChatMessage('Hi'));
    expect(getChatConversation(store.getState()).messages).toEqual([]);
    expect(getChatNotice(store.getState())).toBeNull();
    expect(getChatStatus(store.getState())).toBe('idle');
  });

  it('keeps the key when the API rejects it', async function () {
    const store = setup();
    window.fetchMock.post(MESSAGES_API_URL, {
      status: 401,
      body: {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      },
    });
    await store.dispatch(sendChatMessage('Hi'));
    expect(getChatStatus(store.getState())).toBe('error');
    expect(getChatError(store.getState())).toEqual({
      type: 'auth',
      provider: 'Anthropic',
      message: 'invalid x-api-key',
    });
    // A 401 can be an organization policy rather than a bad key, so the user
    // decides whether to forget it.
    expect(getChatHasCredentials(store.getState())).toBe(true);
  });

  it('starts a new chat in the right format when switching provider', async function () {
    const store = setup();
    mockMessagesApi([
      { content: [{ type: 'text', text: 'Hi' }], stopReason: 'end_turn' },
    ]);
    await store.dispatch(sendChatMessage('Hi'));
    expect(getChatTranscript(store.getState())).toHaveLength(2);

    // Saving the same provider keeps the conversation.
    store.dispatch(
      saveChatProviderSettings('anthropic', { apiKey: 'sk-other' })
    );
    expect(getChatTranscript(store.getState())).toHaveLength(2);

    store.dispatch(
      saveChatProviderSettings('custom', {
        baseURL: TEST_OPENAI_BASE_URL,
      })
    );
    expect(getChatProviderPreset(store.getState())).toBe('custom');
    expect(getChatConversation(store.getState())).toEqual({
      format: 'openai-chat',
      messages: [],
    });
    // A model is required.
    expect(getChatHasCredentials(store.getState())).toBe(false);

    store.dispatch(
      saveChatProviderSettings('custom', {
        baseURL: TEST_OPENAI_BASE_URL,
        model: 'test-model',
      })
    );
    expect(getChatHasCredentials(store.getState())).toBe(true);
  });

  it('runs a full turn through an OpenAI-compatible server', async function () {
    const store = setup();
    store.dispatch(
      saveChatProviderSettings('local', {
        baseURL: TEST_OPENAI_BASE_URL,
        model: 'qwen3',
      })
    );
    const requests = mockChatCompletionsApi([
      {
        toolCalls: [
          { id: 'call_1', args: 'thread select t-1' },
          { id: 'call_2', args: 'thread select t-99' },
        ],
        finishReason: 'tool_calls',
      },
      { text: 'Ygc takes all the time.', finishReason: 'stop' },
    ]);

    await store.dispatch(sendChatMessage('What is the worker doing?'));

    expect(getChatError(store.getState())).toBeNull();
    expect(getSelectedThreadIndexes(store.getState())).toEqual(new Set([1]));
    expect(getChatTranscript(store.getState())).toEqual([
      { type: 'user', text: 'What is the worker doing?' },
      {
        type: 'tool-call',
        id: 'call_1',
        command: 'thread select t-1',
        result: { text: expect.stringContaining('t-1'), isError: false },
      },
      {
        type: 'tool-call',
        id: 'call_2',
        command: 'thread select t-99',
        result: { text: expect.stringContaining('t-99'), isError: true },
      },
      { type: 'assistant', text: 'Ygc takes all the time.' },
    ]);

    const [request] = requests;
    expect(request.model).toBe('qwen3');
    expect(request.messages[1].content).toContain('<current_view>');
    expect(request.tools[0].function.strict).toBeUndefined();
    expect(requests[1].messages.slice(1)).toEqual(
      getChatConversation(store.getState()).messages.slice(0, 4)
    );
  });

  it('names the local server in connection errors', async function () {
    const store = setup();
    store.dispatch(saveChatProviderSettings('local', { model: 'qwen3' }));
    window.fetchMock.post('http://localhost:11434/v1/chat/completions', {
      throws: new TypeError('Failed to fetch'),
    });
    await store.dispatch(sendChatMessage('Hi'));
    expect(getChatError(store.getState())).toEqual({
      type: 'connection',
      provider: 'localhost:11434',
      message: expect.any(String),
    });
  });
});
