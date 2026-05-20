/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { fireEvent, screen } from '@testing-library/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { PanelSearch } from 'firefox-profiler/components/shared/PanelSearch';
import { fireFullKeyPress } from 'firefox-profiler/test/fixtures/utils';
import { coerce } from 'firefox-profiler/utils/types';

describe('shared/PanelSearch', function () {
  function setup({ alsoFocusOnF = false }: { alsoFocusOnF?: boolean } = {}) {
    const onSearch = jest.fn();
    const renderResult = render(
      <PanelSearch
        className="testPanelSearch"
        label="Filter:"
        title="Filter description"
        currentSearchString=""
        onSearch={onSearch}
        alsoFocusOnF={alsoFocusOnF}
      />
    );
    return { ...renderResult, onSearch };
  }

  function getSearchInput(): HTMLInputElement {
    return screen.getByRole('searchbox') as HTMLInputElement;
  }

  it('focuses the search input when the / key is pressed outside any input', () => {
    setup();
    const input = getSearchInput();
    expect(input).not.toHaveFocus();

    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: '/' });

    expect(input).toHaveFocus();
  });

  it('does not steal the / key when focus is already inside an input', () => {
    setup();
    const input = getSearchInput();

    // Add a separate input that will hold focus.
    const otherInput = document.createElement('input');
    otherInput.type = 'text';
    document.body.appendChild(otherInput);
    otherInput.focus();
    expect(otherInput).toHaveFocus();

    // Fire the keydown event from the focused input. The listener should
    // bail out and leave focus where it was.
    fireEvent.keyDown(otherInput, { key: '/' });

    expect(otherInput).toHaveFocus();
    expect(input).not.toHaveFocus();

    document.body.removeChild(otherInput);
  });

  it('does not react to / combined with a modifier key', () => {
    setup();
    const input = getSearchInput();
    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(input).not.toHaveFocus();

    fireEvent.keyDown(window, { key: '/', altKey: true });
    expect(input).not.toHaveFocus();
  });

  it('focuses the search input when the f key is pressed and alsoFocusOnF is true', () => {
    setup({ alsoFocusOnF: true });
    const input = getSearchInput();
    expect(input).not.toHaveFocus();

    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: 'f' });

    expect(input).toHaveFocus();
  });

  it('does not focus the search input on the f key when alsoFocusOnF is not set', () => {
    setup();
    const input = getSearchInput();
    expect(input).not.toHaveFocus();

    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: 'f' });

    expect(input).not.toHaveFocus();
  });

  it('still uses / for focus even when alsoFocusOnF is true', () => {
    setup({ alsoFocusOnF: true });
    const input = getSearchInput();
    expect(input).not.toHaveFocus();

    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: '/' });

    expect(input).toHaveFocus();
  });

  it('removes its global key listener on unmount', () => {
    const { unmount } = setup();
    const input = getSearchInput();
    unmount();

    // After unmount, pressing / should be a no-op (no focus jump back).
    fireFullKeyPress(coerce<Window, HTMLElement>(window), { key: '/' });
    expect(input).not.toHaveFocus();
  });
});
