/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  cancelChatTurn,
  closeChat,
  forgetApiKey,
  openChat,
  resetChat,
  saveApiKey,
  sendChatMessage,
} from 'firefox-profiler/actions/chat';
import {
  getChatApiHistory,
  getChatError,
  getChatHasApiKey,
  getChatNotice,
  getChatStatus,
  getChatTranscript,
  getIsChatOpen,
} from 'firefox-profiler/selectors/chat';
import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { MESSAGES_API_URL, mockMessagesApi } from '../fixtures/anthropic-api';

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
    store.dispatch(saveApiKey('sk-test'));
    return store;
  }

  afterEach(function () {
    window.localStorage.clear();
  });

  it('opens, closes and stores the key', function () {
    const store = setup();
    expect(getIsChatOpen(store.getState())).toBe(false);
    store.dispatch(openChat());
    expect(getIsChatOpen(store.getState())).toBe(true);
    store.dispatch(closeChat());
    expect(getIsChatOpen(store.getState())).toBe(false);

    expect(getChatHasApiKey(store.getState())).toBe(true);
    expect(window.localStorage.getItem('profiler.chat.anthropicApiKey')).toBe(
      'sk-test'
    );
    store.dispatch(forgetApiKey());
    expect(getChatHasApiKey(store.getState())).toBe(false);
    expect(
      window.localStorage.getItem('profiler.chat.anthropicApiKey')
    ).toBeNull();
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
        JSON.stringify(getChatApiHistory(store.getState()).slice(0, 3))
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
    expect(getChatApiHistory(store.getState())).toHaveLength(1);
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
    expect(getChatApiHistory(store.getState())).toEqual([]);
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
      message: 'invalid x-api-key',
    });
    // A 401 can be an organization policy rather than a bad key, so the user
    // decides whether to forget it.
    expect(getChatHasApiKey(store.getState())).toBe(true);
  });
});
