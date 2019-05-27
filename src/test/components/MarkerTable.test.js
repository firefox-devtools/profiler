/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';
// This module is mocked.
import copy from 'copy-to-clipboard';

import MarkerTable from '../../components/marker-table';
import MarkerContextMenu from '../../components/shared/MarkerContextMenu';
import { updatePreviewSelection } from '../../actions/profile-view';
import { ensureExists } from '../../utils/flow';

import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import { getBoundingBox } from '../fixtures/utils';

describe('MarkerTable', function() {
  function setup() {
    // Set an arbitrary size that will not kick in any virtualization behavior.
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(2000, 1000));

    // These were all taken from real-world values.
    const profile = getProfileWithMarkers(
      [
        [
          'UserTiming',
          12.5,
          {
            type: 'UserTiming',
            startTime: 12.5,
            endTime: 12.5,
            name: 'foobar',
            entryType: 'mark',
          },
        ],
        [
          'NotifyDidPaint',
          14.5,
          {
            type: 'tracing',
            category: 'Paint',
            interval: 'start',
          },
        ],
        [
          'setTimeout',
          165.87091900000001,
          {
            type: 'Text',
            startTime: 165.87091900000001,
            endTime: 165.871503,
            name: '5.5',
          },
        ],
      ]
        // Sort the markers.
        .sort((a, b) => a[1] - b[1])
    );

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <>
          <MarkerContextMenu />
          <MarkerTable />
        </>
      </Provider>
    );
    const { container, getByText } = renderResult;

    const fixedRows = () =>
      Array.from(container.querySelectorAll('.treeViewRowFixedColumns'));
    const scrolledRows = () =>
      Array.from(container.querySelectorAll('.treeViewRowScrolledColumns'));

    const node = str => getByText(str);
    const row = str =>
      ensureExists(
        node(str).closest('.treeViewRow'),
        `Couldn't find the row for node ${String(str)}.`
      );
    const contextMenu = () =>
      ensureExists(
        container.querySelector('.react-contextmenu'),
        `Couldn't find the context menu.`
      );

    const click = (element: HTMLElement) => {
      fireEvent.mouseDown(element);
      fireEvent.mouseUp(element);
      fireEvent.click(element);
    };

    const rightClick = (element: HTMLElement) => {
      fireEvent.mouseDown(element, { button: 2, buttons: 2 });
      fireEvent.mouseUp(element, { button: 2, buttons: 2 });
      fireEvent.contextMenu(element);
    };

    return {
      ...renderResult,
      ...store,
      fixedRows,
      scrolledRows,
      node,
      row,
      contextMenu,
      click,
      rightClick,
    };
  }

  it('renders some basic markers and updates when needed', () => {
    const { container, fixedRows, scrolledRows, dispatch } = setup();

    expect(fixedRows()).toHaveLength(3);
    expect(scrolledRows()).toHaveLength(3);
    expect(container.firstChild).toMatchSnapshot();

    /* Check that the table updates properly despite the memoisation. */
    dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 10,
        selectionEnd: 20,
      })
    );

    expect(fixedRows()).toHaveLength(2);
    expect(scrolledRows()).toHaveLength(2);
  });

  it('selects a row when left clicking', () => {
    const { node, row, click } = setup();

    click(node(/setTimeout/));
    expect(row(/setTimeout/)).toHaveClass('selected');

    click(node('foobar'));
    expect(row(/setTimeout/)).not.toHaveClass('selected');
    expect(row('foobar')).toHaveClass('selected');
  });

  it('displays a context menu when right clicking', () => {
    jest.useFakeTimers();

    const { contextMenu, node, row, rightClick, getByText } = setup();

    function checkMenuIsDisplayedForNode(str) {
      expect(contextMenu()).toHaveClass('react-contextmenu--visible');

      // Note that selecting a menu item will close the menu.
      fireEvent.click(getByText('Copy marker description'));
      expect(copy).toHaveBeenLastCalledWith(expect.stringMatching(str));
    }

    rightClick(node(/setTimeout/));
    checkMenuIsDisplayedForNode(/setTimeout/);
    expect(row(/setTimeout/)).toHaveClass('rightClicked');

    // Wait that all timers are done before trying again.
    jest.runAllTimers();

    // Now try it again by right clicking 2 nodes in sequence.
    rightClick(node(/setTimeout/));
    rightClick(node('foobar'));
    checkMenuIsDisplayedForNode('foobar');
    expect(row(/setTimeout/)).not.toHaveClass('rightClicked');
    expect(row('foobar')).toHaveClass('rightClicked');

    // Wait that all timers are done before trying again.
    jest.runAllTimers();

    // And now let's do it again, but this time waiting for timers before
    // clicking, because the timer can impact the menu being displayed.
    rightClick(node('NotifyDidPaint'));
    rightClick(node('foobar'));
    jest.runAllTimers();
    checkMenuIsDisplayedForNode('foobar');
    expect(row('foobar')).toHaveClass('rightClicked');
  });
});
