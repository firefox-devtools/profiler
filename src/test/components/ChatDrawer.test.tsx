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
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect';
import { mockMessagesApi } from 'firefox-profiler/test/fixtures/anthropic-api';
import { fireEvent, waitFor } from '@testing-library/react';

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
    const call = window.fetchMock.callHistory.lastCall(
      'https://api.openai.com/v1/models'
    );
    expect(
      (call?.options.headers as Record<string, string>).authorization
    ).toBe('Bearer sk-openai');

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
