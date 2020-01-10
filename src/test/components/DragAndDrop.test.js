/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { render, fireEvent } from 'react-testing-library';
import DragAndDrop from '../../components/app/DragAndDrop';

describe('app/DragAndDrop', () => {
  it('matches the snapshot', () => {
    const retrieveProfileFromFile = jest.fn();
    const { container } = render(
      <DragAndDrop retrieveProfileFromFile={retrieveProfileFromFile}>
        Target area here
      </DragAndDrop>
    );
    const [targetArea, message] = container.children;
    expect(targetArea).toMatchSnapshot();
    expect(message).toMatchSnapshot();
  });

  it('responds to dragging', () => {
    // It would be better if we could check that when dropping
    // something on the area we'd get a call to
    // `retrieveProfileFromFile`, but jsdom is not supporting
    // `dataTransfer`. See
    // https://github.com/testing-library/react-testing-library/issues/339
    // for more info.
    const retrieveProfileFromFile = jest.fn();
    const { container } = render(
      <DragAndDrop retrieveProfileFromFile={retrieveProfileFromFile}>
        Target area here
      </DragAndDrop>
    );
    const [targetArea, message] = container.children;
    expect(message.classList).not.toContain('dragging');

    fireEvent.dragEnter(targetArea);
    expect(message.classList).toContain('dragging');

    fireEvent.dragExit(targetArea);
    expect(message.classList).not.toContain('dragging');
  });
});
