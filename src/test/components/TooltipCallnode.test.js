/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import { Provider } from 'react-redux';
import { TooltipCallNode } from '../../components/tooltip/CallNode';
import { render } from 'react-testing-library';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithNativeAllocations } from '../fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import * as ProfileSelectors from '../../selectors/profile';
import * as UrlState from '../../selectors/url-state';
import {
  changeSelectedCallNode,
  changeCallTreeSummaryStrategy,
} from '../../actions/profile-view';
import { ensureExists } from '../../utils/flow';

describe('TooltipCallNode', function() {
  function setup(profile) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    function renderTooltip(): * {
      // This component is not currently connected.
      return render(
        <Provider store={store}>
          <TooltipCallNode
            thread={selectedThreadSelectors.getThread(getState())}
            callNodeIndex={ensureExists(
              selectedThreadSelectors.getSelectedCallNodeIndex(getState()),
              'Unable to find a selected call node index.'
            )}
            callNodeInfo={selectedThreadSelectors.getCallNodeInfo(getState())}
            categories={ProfileSelectors.getCategories(getState())}
            interval={ProfileSelectors.getProfileInterval(getState())}
            durationText="Fake Duration Text"
            callTree={selectedThreadSelectors.getCallTree(getState())}
            callTreeSummaryStrategy={UrlState.getCallTreeSummaryStrategy(
              getState()
            )}
          />
        </Provider>
      );
    }
    return { getState, dispatch, renderTooltip };
  }

  it('handles native allocations', () => {
    const { profile, funcNamesDict } = getProfileWithNativeAllocations();
    const threadIndex = 0;
    const callNodePath = ['A', 'B', 'Fjs', 'Gjs'].map(
      name => funcNamesDict[name]
    );

    const { dispatch, renderTooltip } = setup(profile);
    dispatch(changeSelectedCallNode(threadIndex, callNodePath));
    dispatch(changeCallTreeSummaryStrategy('native-allocations'));
    const { container } = renderTooltip();

    expect(container.firstChild).toMatchSnapshot();
  });
});
