/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import createStore from '../../app-logic/create-store';
import { createBrowserConnection } from '../../app-logic/browser-connection';
import {
  DragAndDrop,
  DragAndDropOverlay,
} from '../../components/app/DragAndDrop';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { serializeProfile } from '../../profile-logic/process-profile';
import { getView } from 'firefox-profiler/selectors';
import { updateBrowserConnectionStatus } from 'firefox-profiler/actions/app';
import { mockWebChannel } from '../fixtures/mocks/web-channel';

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
        <DragAndDrop>
          Target area here, and a <span>nested element</span>.
        </DragAndDrop>
      </Provider>
    );
    const [dragAndDrop, overlay] = container.children;
    const nestedSpan = dragAndDrop.querySelector('span');
    if (nestedSpan === null) {
      throw new Error('span should exist');
    }

    expect(overlay.classList).not.toContain('dragging');

    fireEvent.dragEnter(dragAndDrop);
    expect(overlay.classList).toContain('dragging');

    fireEvent.dragEnter(nestedSpan);
    expect(overlay.classList).toContain('dragging');

    fireEvent.dragLeave(dragAndDrop);
    expect(overlay.classList).toContain('dragging');

    fireEvent.dragLeave(nestedSpan);
    expect(overlay.classList).not.toContain('dragging');
  });

  it('receives profile on file drop', async () => {
    // When the file is dropped, the profiler tries to connect to the WebChannel
    // for symbolication. Handle that request so that we don't time out.
    // We handle it by rejecting it.
    const { registerMessageToChromeListener, triggerResponse } =
      mockWebChannel();
    registerMessageToChromeListener(() => {
      triggerResponse({
        errno: 2, // ERRNO_NO_SUCH_CHANNEL
        error: 'No such channel',
      });
    });
    // Ignore the console.error from the the WebChannel error.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const store = createStore();

    const browserConnectionStatus =
      await createBrowserConnection('Firefox/123.0');
    store.dispatch(updateBrowserConnectionStatus(browserConnectionStatus));

    const { container } = render(
      <Provider store={store}>
        <DragAndDrop>Target area here</DragAndDrop>
      </Provider>
    );
    const [dragAndDrop, overlay] = container.children;

    const { profile } = getProfileFromTextSamples('A');
    const file = new File([serializeProfile(profile)], 'profile.json', {
      type: 'application/json',
    });
    const files = [file];

    fireEvent.dragEnter(dragAndDrop);
    fireEvent.drop(dragAndDrop, { dataTransfer: { files } });
    await waitFor(() =>
      expect(getView(store.getState()).phase).toBe('DATA_LOADED')
    );
    expect(spy).toHaveBeenCalled();

    // Make sure that dragging after a drop still works correctly.
    expect(overlay.classList).not.toContain('dragging');

    fireEvent.dragEnter(dragAndDrop);
    expect(overlay.classList).toContain('dragging');

    fireEvent.dragLeave(dragAndDrop);
    expect(overlay.classList).not.toContain('dragging');
  });
});
