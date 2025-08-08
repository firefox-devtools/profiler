/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import createStore from 'firefox-profiler/app-logic/create-store';
import { KeyboardShortcut } from 'firefox-profiler/components/app/KeyboardShortcut';
import { fireFullKeyPress } from 'firefox-profiler/test/fixtures/utils';
import { coerce } from 'firefox-profiler/utils/flow';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';

describe('app/KeyboardShortcut', function () {
  function setup() {
    const store = createStore();
    const renderResults = render(
      <Provider store={store}>
        <KeyboardShortcut wrapperClassName="exampleClassName">
          <div>Content</div>
          <button type="button">Click me</button>
        </KeyboardShortcut>
      </Provider>
    );

    return { ...renderResults, ...store };
  }

  it('can open and close when hitting ? and Escape respectively', () => {
    const { getByText, queryByText } = setup();

    expect(queryByText('Keyboard shortcuts')).not.toBeInTheDocument();

    // Show the dialog.
    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: '?' });
    expect(getByText('Keyboard shortcuts')).toBeInTheDocument();

    // Hide the dialog.
    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: 'Escape' });
    expect(queryByText('Keyboard shortcuts')).not.toBeInTheDocument();
  });

  it('matches the snapshot when closed', () => {
    const { container } = setup();
    expect(container).toMatchSnapshot();
  });

  it('matches the snapshot when open', () => {
    const { container } = setup();
    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: '?' });
    expect(container).toMatchSnapshot();
  });

  it('reverts to the previous active element', () => {
    const flushRafCalls = mockRaf();
    const { getByRole } = setup();

    const clickMe = getByRole('button');
    clickMe.focus();

    expect(clickMe).toHaveFocus();

    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: '?' });
    flushRafCalls(); // The focus is changed after react render.

    expect(getByRole('dialog')).toHaveFocus();

    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: 'Escape' });
    flushRafCalls(); // The focus is changed after react render.

    expect(clickMe).toHaveFocus();
  });
});
