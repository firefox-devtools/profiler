/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import createStore from '../../app-logic/create-store';
import {
  DragAndDrop,
  DragAndDropOverlay,
} from '../../components/app/DragAndDrop';

describe('app/DragAndDrop', () => {
  it('matches the snapshot with default overlay', () => {
    const { container } = render(
      <Provider store={createStore()}>
        <DragAndDrop>Target area here</DragAndDrop>
      </Provider>
    );
    const [dragAndDrop, overlay] = container.children;
    expect(dragAndDrop).toMatchSnapshot();
    expect(overlay).toMatchSnapshot();
  });

  it('matches the snapshot with custom overlay', () => {
    const { container } = render(
      <Provider store={createStore()}>
        <DragAndDrop>
          Target area here
          <DragAndDropOverlay />
        </DragAndDrop>
      </Provider>
    );
    const [dragAndDrop] = container.children;
    expect(dragAndDrop).toMatchSnapshot();
  });

  it('responds to dragging', () => {
    // It would be better if we could check that when dropping
    // something on the area we'd get a call to
    // `retrieveProfileFromFile`, but jsdom is not supporting
    // `dataTransfer`. We should improve this test when that support
    // is added:
    // https://github.com/firefox-devtools/profiler/issues/2366
    const { container } = render(
      <Provider store={createStore()}>
        <DragAndDrop>Target area here</DragAndDrop>
      </Provider>
    );
    const [dragAndDrop, overlay] = container.children;
    expect(overlay.classList).not.toContain('dragging');

    fireEvent.dragEnter(dragAndDrop);
    expect(overlay.classList).toContain('dragging');

    fireEvent.dragExit(dragAndDrop);
    expect(overlay.classList).not.toContain('dragging');

      fireEvent.drop(dragAndDrop);
    expect(overlay.classList).not.toContain('dragging');
  });
  });
