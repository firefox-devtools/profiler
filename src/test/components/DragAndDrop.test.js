/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import createStore from '../../app-logic/create-store';
import {
  DragAndDrop,
  DragAndDropOverlay,
} from '../../components/app/DragAndDrop';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { serializeProfile } from '../../profile-logic/process-profile';

import type { Profile } from 'firefox-profiler/types';

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
  });

  it('receives profile on file drop', async () => {
    const { container } = render(
      <Provider store={createStore()}>
        <DragAndDrop>Target area here</DragAndDrop>
      </Provider>
    );
    const [dragAndDrop] = container.children;

    const profile = serializeProfile(_getSimpleProfile());
    const file = new File([profile], 'profile.json', {
      type: 'application/json',
    });
    const files = [file];

    fireEvent.drop(dragAndDrop, { dataTransfer: { files } });
    await waitFor(() => expect('PROFILE_LOADED').toBeTruthy());
  });
});

/**
 * This profile will have a single sample, and a single thread.
 */
function _getSimpleProfile(): Profile {
  return getProfileFromTextSamples('A').profile;
}
