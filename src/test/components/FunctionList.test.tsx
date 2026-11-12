/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { ProfileFunctionListView } from '../../components/calltree/ProfileFunctionListView';
import { changeSelectedThreads } from '../../actions/profile-view';
import { changeSelectedTab } from '../../actions/app';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getSelectedThreadIndexes } from '../../selectors/url-state';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

autoMockCanvasContext();
autoMockElementSize({ width: 1000, height: 2000 });

describe('calltree/FunctionList', function () {
  function setup() {
    const {
      profile,
      funcNamesDictPerThread: [funcNamesThread0, funcNamesThread1],
    } = getProfileFromTextSamples(
      `
        A  A  A
        B  B  C
      `,
      `
        D  D  D
        E  E  F
      `
    );
    const store = storeWithProfile(profile);
    store.dispatch(changeSelectedTab('function-list'));
    render(
      <Provider store={store}>
        <ProfileFunctionListView />
      </Provider>
    );
    return { ...store, funcNamesThread0, funcNamesThread1 };
  }

  it('selects the heaviest function initially', function () {
    const { getState, funcNamesThread0 } = setup();
    expect(getSelectedThreadIndexes(getState())).toEqual(new Set([0]));
    expect(selectedThreadSelectors.getSelectedFunctionIndex(getState())).toBe(
      funcNamesThread0.A
    );
  });

  it('selects the heaviest function after switching threads', function () {
    const { getState, dispatch, funcNamesThread1 } = setup();
    act(() => {
      dispatch(changeSelectedThreads(new Set([1])));
    });
    expect(selectedThreadSelectors.getSelectedFunctionIndex(getState())).toBe(
      funcNamesThread1.D
    );
  });
});
