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
import { fireEvent } from '@testing-library/react';

// We're not interested in the timeline in this test.
jest.mock('../../components/timeline', () => ({
  Timeline: 'custom-timeline',
}));

describe('ChatDrawer', function () {
  autoMockDomRect();

  afterEach(function () {
    window.localStorage.clear();
  });

  function setup({ enabled = true, apiKey = null as string | null } = {}) {
    if (enabled) {
      window.localStorage.setItem('profiler.chat.enabled', 'true');
    }
    if (apiKey !== null) {
      window.localStorage.setItem('profiler.chat.anthropicApiKey', apiKey);
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
    return { ...renderResult, store, openChat, getInput, send };
  }

  it('is hidden without the feature flag', function () {
    setup({ enabled: false });
    expect(
      screen.queryByRole('button', { name: 'Ask about this profile' })
    ).not.toBeInTheDocument();
    expect(document.querySelector('.chatDrawer')).toBeNull();
  });

  it('asks for a key, then shows the composer', async function () {
    const { openChat } = setup();
    openChat();
    expect(await screen.findByText(/sent to Anthropic/)).toBeInTheDocument();

    const keyInput = screen.getByPlaceholderText('Anthropic API key');
    fireEvent.change(keyInput, { target: { value: ' sk-ant-test ' } });
    fireFullClick(screen.getByRole('button', { name: 'Save key' }));

    expect(window.localStorage.getItem('profiler.chat.anthropicApiKey')).toBe(
      'sk-ant-test'
    );
    expect(
      screen.getByPlaceholderText('Ask about this profile')
    ).toBeInTheDocument();

    fireFullClick(screen.getByRole('button', { name: 'Forget key' }));
    expect(
      window.localStorage.getItem('profiler.chat.anthropicApiKey')
    ).toBeNull();
    expect(
      screen.getByPlaceholderText('Anthropic API key')
    ).toBeInTheDocument();
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
