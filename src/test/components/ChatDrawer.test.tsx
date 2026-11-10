/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { ProfileViewer } from 'firefox-profiler/components/app/ProfileViewer';
import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import { ensureExists } from 'firefox-profiler/utils/types';
import {
  render,
  screen,
  act,
  within,
} from 'firefox-profiler/test/fixtures/testing-library';
import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from 'firefox-profiler/actions/receive-profile';
import { setChatFeatureEnabled } from 'firefox-profiler/actions/chat';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect';
import { computeCodeChallenge } from 'firefox-profiler/app-logic/profile-chat/providers/openrouter-auth';
import {
  makeSseResponse,
  mockMessagesApi,
} from 'firefox-profiler/test/fixtures/anthropic-api';
import { fireEvent, waitFor } from '@testing-library/react';
// ProfileViewer loads the drawer lazily. Loading it here keeps that cost out
// of the first test that opens it, which could time out on slow CI machines.
import 'firefox-profiler/components/chat/ChatDrawer';

// We're not interested in the timeline in this test.
jest.mock('../../components/timeline', () => ({
  Timeline: 'custom-timeline',
}));

describe('ChatDrawer', function () {
  autoMockDomRect();

  const getDrawer = () =>
    within(ensureExists(document.querySelector<HTMLElement>('.chatDrawer')));

  afterEach(function () {
    window.localStorage.clear();
  });

  function setup({ enabled = true, apiKey = null as string | null } = {}) {
    if (enabled) {
      window.localStorage.setItem('profiler.chat.enabled', 'true');
    }
    if (apiKey !== null) {
      window.localStorage.setItem(
        'profiler.chat.settings.anthropic',
        JSON.stringify({ apiKey })
      );
    }
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
    const store = blankStore();
    store.dispatch(
      updateUrlState(
        stateFromLocation({ pathname: '/from-browser', search: '', hash: '' })
      )
    );
    store.dispatch(viewProfile(profile));
    const renderResult = render(
      <Provider store={store}>
        <ProfileViewer />
      </Provider>
    );

    const openChat = () =>
      fireFullClick(
        screen.getByRole('button', { name: 'Ask about this profile' })
      );
    const getInput = () =>
      screen.getByPlaceholderText('Ask about this profile');
    // The drawer is loaded lazily, so wait for it.
    const send = async (text: string) => {
      const input = await screen.findByPlaceholderText(
        'Ask about this profile'
      );
      fireEvent.change(input, { target: { value: text } });
      fireEvent.keyDown(input, { key: 'Enter' });
    };
    const getStoredSettings = (preset: string) =>
      JSON.parse(
        window.localStorage.getItem(`profiler.chat.settings.${preset}`) ??
          'null'
      );
    return {
      ...renderResult,
      store,
      openChat,
      getInput,
      send,
      getStoredSettings,
    };
  }

  it('is hidden without the feature flag', function () {
    setup({ enabled: false });
    expect(
      screen.queryByRole('button', { name: 'Ask about this profile' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('.chatDrawer')).toBeNull();
  });

  it('can be enabled and disabled without a reload', async function () {
    const { store, openChat } = setup({ enabled: false });
    act(() => {
      store.dispatch(setChatFeatureEnabled(true));
    });
    expect(window.localStorage.getItem('profiler.chat.enabled')).toBe('true');
    openChat();
    expect(await screen.findByText(/sent to Anthropic/)).toBeInTheDocument();

    act(() => {
      store.dispatch(setChatFeatureEnabled(false));
    });
    expect(window.localStorage.getItem('profiler.chat.enabled')).toBeNull();
    expect(document.querySelector('.chatDrawer')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Ask about this profile' })
    ).not.toBeInTheDocument();
  });

  it('asks for an Anthropic key, then shows the composer', async function () {
    const { openChat, getStoredSettings } = setup();
    openChat();
    expect(await screen.findByText(/sent to Anthropic/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: ' sk-ant-test ' },
    });
    fireFullClick(saveButton);

    expect(getStoredSettings('anthropic')).toEqual({ apiKey: 'sk-ant-test' });
    expect(window.localStorage.getItem('profiler.chat.provider')).toBe(
      'anthropic'
    );
    expect(
      screen.getByPlaceholderText('Ask about this profile')
    ).toBeInTheDocument();

    // The settings show the stored key, which can be forgotten.
    fireFullClick(getDrawer().getByRole('button', { name: 'Settings' }));
    expect(screen.getByLabelText('API key')).toHaveValue('sk-ant-test');
    fireFullClick(screen.getByRole('button', { name: 'Forget key' }));
    expect(getStoredSettings('anthropic')).toEqual({});
    expect(screen.getByLabelText('API key')).toHaveValue('');
    // Nothing to go back to without a key.
    expect(
      screen.queryByRole('button', { name: 'Cancel' })
    ).not.toBeInTheDocument();
  });

  it('can go back from the settings without changing them', async function () {
    const { openChat } = setup({ apiKey: 'sk-ant-test' });
    openChat();
    await screen.findByPlaceholderText('Ask about this profile');
    fireFullClick(getDrawer().getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'openai' },
    });
    fireFullClick(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByPlaceholderText('Ask about this profile')
    ).toBeInTheDocument();
    expect(window.localStorage.getItem('profiler.chat.provider')).toBeNull();
  });

  it('configures OpenAI with a model from the model list', async function () {
    window.fetchMock.get('https://api.openai.com/v1/models', {
      object: 'list',
      data: [{ id: 'gpt-b' }, { id: 'gpt-a' }],
    });
    const { openChat, getStoredSettings } = setup();
    openChat();
    const providerSelect = await screen.findByLabelText('Provider');
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    expect(screen.getByText(/sent to OpenAI/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Server URL')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-openai' },
    });
    expect(
      await screen.findByText('Loading the model list…')
    ).toBeInTheDocument();
    const modelInput = screen.getByLabelText('Model');
    const getSuggestedModels = () =>
      [
        ...document.querySelectorAll(
          `#${CSS.escape(modelInput.getAttribute('list') ?? '')} option`
        ),
      ].map((option) => option.getAttribute('value'));
    await waitFor(() =>
      expect(getSuggestedModels()).toEqual(['gpt-a', 'gpt-b'])
    );
    const call = ensureExists(
      window.fetchMock.callHistory.lastCall('https://api.openai.com/v1/models')
    );
    expect((call.options.headers as Record<string, string>).authorization).toBe(
      'Bearer sk-openai'
    );

    // A model is required.
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
    fireEvent.change(modelInput, { target: { value: 'gpt-a' } });
    fireFullClick(saveButton);
    expect(getStoredSettings('openai')).toEqual({
      apiKey: 'sk-openai',
      model: 'gpt-a',
    });
    expect(window.localStorage.getItem('profiler.chat.provider')).toBe(
      'openai'
    );
    expect(
      screen.getByPlaceholderText('Ask about this profile')
    ).toBeInTheDocument();
  });

  it('connects OpenRouter through the popup and lists tool models', async function () {
    window.fetchMock.get('https://openrouter.ai/api/v1/models', {
      data: [
        { id: 'vendor/chat-only', supported_parameters: ['max_tokens'] },
        { id: 'vendor/with-tools', supported_parameters: ['tools'] },
      ],
    });
    window.fetchMock.post('https://openrouter.ai/api/v1/auth/keys', {
      key: 'sk-or-v1-test',
    });
    const openSpy = jest.spyOn(window, 'open').mockReturnValue({} as Window);
    const { openChat, getStoredSettings } = setup();
    openChat();
    fireEvent.change(await screen.findByLabelText('Provider'), {
      target: { value: 'openrouter' },
    });
    expect(
      screen.getByText(/sent to OpenRouter and to the provider/)
    ).toBeInTheDocument();

    const connectButton = screen.getByRole('button', {
      name: 'Connect OpenRouter',
    });
    // Enabled once the PKCE parameters are ready.
    await waitFor(() => expect(connectButton).toBeEnabled());
    fireFullClick(connectButton);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const authURL = new URL(openSpy.mock.calls[0][0] as string);
    expect(authURL.origin + authURL.pathname).toBe(
      'https://openrouter.ai/auth'
    );
    expect(authURL.searchParams.get('callback_url')).toBe(
      'http://localhost/oauth/openrouter-callback.html'
    );
    expect(
      screen.getByText(/Finish signing in to OpenRouter/)
    ).toBeInTheDocument();

    // What res/oauth/openrouter-callback.js does in the popup.
    const callback = new BroadcastChannel('profiler-openrouter-auth');
    callback.postMessage({
      code: 'code-1',
      state: authURL.searchParams.get('state'),
    });
    callback.close();

    await waitFor(() =>
      expect(screen.getByLabelText('API key')).toHaveValue('sk-or-v1-test')
    );
    // Stored right away, the key exists in the user's account now.
    expect(getStoredSettings('openrouter')).toEqual({
      apiKey: 'sk-or-v1-test',
    });
    expect(
      screen.getByRole('button', { name: 'Forget key' })
    ).toBeInTheDocument();
    const exchange = window.fetchMock.callHistory.lastCall(
      'https://openrouter.ai/api/v1/auth/keys'
    );
    const exchangeBody = JSON.parse(exchange?.options.body as string);
    expect(exchangeBody.code).toBe('code-1');
    expect(await computeCodeChallenge(exchangeBody.code_verifier)).toBe(
      authURL.searchParams.get('code_challenge')
    );

    const modelInput = screen.getByLabelText('Model');
    await waitFor(() =>
      expect(
        [
          ...document.querySelectorAll(
            `#${CSS.escape(modelInput.getAttribute('list') ?? '')} option`
          ),
        ].map((option) => option.getAttribute('value'))
      ).toEqual(['vendor/with-tools'])
    );
    fireEvent.change(modelInput, { target: { value: 'vendor/with-tools' } });
    fireFullClick(screen.getByRole('button', { name: 'Save' }));
    expect(getStoredSettings('openrouter')).toEqual({
      apiKey: 'sk-or-v1-test',
      model: 'vendor/with-tools',
    });
    expect(window.localStorage.getItem('profiler.chat.provider')).toBe(
      'openrouter'
    );
    openSpy.mockRestore();
  });

  it('says when the OpenRouter sign-in is denied', async function () {
    window.fetchMock.get('https://openrouter.ai/api/v1/models', { data: [] });
    const openSpy = jest.spyOn(window, 'open').mockReturnValue({} as Window);
    const { openChat } = setup();
    openChat();
    fireEvent.change(await screen.findByLabelText('Provider'), {
      target: { value: 'openrouter' },
    });
    const connectButton = screen.getByRole('button', {
      name: 'Connect OpenRouter',
    });
    await waitFor(() => expect(connectButton).toBeEnabled());
    fireFullClick(connectButton);
    expect(
      screen.getByText(/Finish signing in to OpenRouter/)
    ).toBeInTheDocument();

    // OpenRouter redirects without a code or a state when access is denied.
    const callback = new BroadcastChannel('profiler-openrouter-auth');
    callback.postMessage({ code: null, state: null });
    callback.close();

    expect(
      await screen.findByText('The OpenRouter sign-in was cancelled.')
    ).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('says when the OpenRouter popup is blocked', async function () {
    window.fetchMock.get('https://openrouter.ai/api/v1/models', { data: [] });
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);
    const { openChat } = setup();
    openChat();
    fireEvent.change(await screen.findByLabelText('Provider'), {
      target: { value: 'openrouter' },
    });
    const connectButton = screen.getByRole('button', {
      name: 'Connect OpenRouter',
    });
    await waitFor(() => expect(connectButton).toBeEnabled());
    fireFullClick(connectButton);
    expect(
      screen.getByText(/The OpenRouter window was blocked/)
    ).toBeInTheDocument();
    openSpy.mockRestore();
  });

  it('configures a local model, typing the name when the list fails', async function () {
    window.fetchMock.get('http://localhost:11434/v1/models', {
      throws: new TypeError('Failed to fetch'),
    });
    const { openChat, getStoredSettings } = setup();
    openChat();
    fireEvent.change(await screen.findByLabelText('Provider'), {
      target: { value: 'local' },
    });
    expect(screen.getByText(/stay on this computer/)).toBeInTheDocument();
    expect(screen.getByLabelText('Server URL')).toHaveValue(
      'http://localhost:11434/v1'
    );
    expect(screen.getByLabelText('API key (optional)')).toHaveValue('');

    expect(
      await screen.findByText(/Could not load the model list \(.*\)/)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'qwen3:8b' },
    });
    fireFullClick(screen.getByRole('button', { name: 'Save' }));
    expect(getStoredSettings('local')).toEqual({
      baseURL: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
    });
  });

  it('requires a URL for a custom server', async function () {
    const { openChat, getStoredSettings } = setup();
    openChat();
    fireEvent.change(await screen.findByLabelText('Provider'), {
      target: { value: 'custom' },
    });
    expect(
      screen.getByText(/sent to the server at this URL/)
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'gateway-model' },
    });
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Server URL'), {
      target: { value: 'https://gateway.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('API key (optional)'), {
      target: { value: 'gw-key' },
    });
    fireFullClick(saveButton);
    expect(getStoredSettings('custom')).toEqual({
      apiKey: 'gw-key',
      baseURL: 'https://gateway.example.com/v1',
      model: 'gateway-model',
    });
  });

  it('runs a turn, showing the commands and the answer', async function () {
    const { store, openChat, send, getInput } = setup({
      apiKey: 'sk-ant-test',
    });
    mockMessagesApi([
      {
        content: [
          { type: 'text', text: 'Looking at the worker.' },
          { type: 'tool_use', id: 'toolu_1', args: 'thread select t-1' },
          { type: 'tool_use', id: 'toolu_2', args: 'thread select t-99' },
        ],
        stopReason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'All samples are in **Ygc**.' }],
        stopReason: 'end_turn',
      },
    ]);
    openChat();
    await send('What is the worker doing?');

    const drawer = within(
      ensureExists(document.querySelector<HTMLElement>('.chatDrawer'))
    );
    expect(await drawer.findByText('Ygc')).toBeInTheDocument();
    expect(drawer.getByText('Ygc').tagName).toBe('STRONG');
    expect(drawer.getByText('What is the worker doing?')).toBeInTheDocument();
    expect(drawer.getByText('Looking at the worker.')).toBeInTheDocument();
    expect(getInput()).toHaveValue('');
    expect(getSelectedThreadIndexes(store.getState())).toEqual(new Set([1]));

    const chip = ensureExists(
      drawer.getByText('pq thread select t-1').closest('details')
    );
    expect(chip).not.toHaveClass('chatToolCallError');
    expect(chip.open).toBe(false);
    fireFullClick(drawer.getByText('pq thread select t-1'));
    expect(chip.open).toBe(true);
    expect(chip.querySelector('pre')).toHaveTextContent('DOM Worker');

    const failedChip = drawer
      .getByText('pq thread select t-99')
      .closest('details');
    expect(failedChip).toHaveClass('chatToolCallError');

    expect(document.querySelector('.chatDrawer')).toMatchSnapshot();
  });

  it('renders tables in the answer', async function () {
    const { openChat, send } = setup({ apiKey: 'sk-ant-test' });
    mockMessagesApi([
      {
        content: [
          {
            type: 'text',
            text: '| Function | Samples |\n| --- | --- |\n| A | 3 |',
          },
        ],
        stopReason: 'end_turn',
      },
    ]);
    openChat();
    await send('Which function is hot?');

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: 'Samples' })
    ).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '3' })).toBeInTheDocument();
  });

  it("doesn't load images from the answer", async function () {
    const { openChat, send } = setup({ apiKey: 'sk-ant-test' });
    mockMessagesApi([
      {
        content: [
          {
            type: 'text',
            text: 'See ![chart](https://example.com/leak?data=secret) here.',
          },
        ],
        stopReason: 'end_turn',
      },
    ]);
    openChat();
    await send('Show me a chart');

    const drawer = ensureExists(
      document.querySelector<HTMLElement>('.chatDrawer')
    );
    expect(await within(drawer).findByText(/here\./)).toBeInTheDocument();
    expect(drawer.querySelector('img')).toBeNull();
  });

  it('keeps working when closed, and says so on the menu button', async function () {
    const { openChat, send } = setup({ apiKey: 'sk-ant-test' });
    let respond: (() => void) | null = null;
    mockMessagesApi([
      () =>
        new Promise<Response>((resolve) => {
          respond = () =>
            resolve(
              makeSseResponse({
                content: [{ type: 'text', text: 'All done.' }],
                stopReason: 'end_turn',
              })
            );
        }),
    ]);
    openChat();
    await send('Hello');
    await screen.findByRole('button', { name: 'Stop' });

    fireFullClick(screen.getByRole('button', { name: 'Close' }));
    const menuButton = screen.getByTitle(
      'The chat is still working on an answer.'
    );
    expect(menuButton).toHaveTextContent('Ask about this profile');

    await act(async () => {
      respond?.();
    });
    await waitFor(() => expect(menuButton).not.toHaveAttribute('title'));
    openChat();
    expect(await screen.findByText('All done.')).toBeInTheDocument();
  });

  it('keeps the draft when closed', async function () {
    const { openChat } = setup({ apiKey: 'sk-ant-test' });
    openChat();
    fireEvent.change(
      await screen.findByPlaceholderText('Ask about this profile'),
      { target: { value: 'Why is the GC' } }
    );
    fireFullClick(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByPlaceholderText('Ask about this profile')
    ).not.toBeInTheDocument();

    openChat();
    expect(
      await screen.findByPlaceholderText('Ask about this profile')
    ).toHaveValue('Why is the GC');
  });

  it('moves the focus in on open, and back to the menu button on close', async function () {
    const { openChat } = setup({ apiKey: 'sk-ant-test' });
    openChat();
    const input = await screen.findByPlaceholderText('Ask about this profile');
    expect(input).toHaveFocus();
    expect(
      screen.getByRole('complementary', { name: 'Ask about this profile' })
    ).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ask about this profile' })
    ).toHaveFocus();
  });

  it('can be stopped', async function () {
    const { openChat, send } = setup({ apiKey: 'sk-ant-test' });
    let respond: (() => void) | null = null;
    mockMessagesApi([
      () =>
        new Promise<Response>((_resolve, reject) => {
          respond = () => reject(new DOMException('Aborted', 'AbortError'));
        }),
    ]);
    openChat();
    await send('Hello');

    const stopButton = await screen.findByRole('button', { name: 'Stop' });
    fireFullClick(stopButton);
    await act(async () => {
      respond?.();
    });
    expect(await screen.findByText('Stopped.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
