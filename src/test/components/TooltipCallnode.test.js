/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import { Provider } from 'react-redux';
import { TooltipCallNode } from '../../components/tooltip/CallNode';
import { render } from 'react-testing-library';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithUnbalancedNativeAllocations,
  getProfileFromTextSamples,
} from '../fixtures/profiles/processed-profile';
import * as selectors from 'firefox-profiler/selectors';
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
            thread={selectors.selectedThread.getThread(getState())}
            pages={selectors.getPageList(getState())}
            callNodeIndex={ensureExists(
              selectors.selectedThread.getSelectedCallNodeIndex(getState()),
              'Unable to find a selected call node index.'
            )}
            callNodeInfo={selectors.selectedThread.getCallNodeInfo(getState())}
            categories={selectors.getCategories(getState())}
            interval={selectors.getProfileInterval(getState())}
            durationText="Fake Duration Text"
            callTree={selectors.selectedThread.getCallTree(getState())}
            callTreeSummaryStrategy={selectors.selectedThread.getCallTreeSummaryStrategy(
              getState()
            )}
          />
        </Provider>
      );
    }
    return { getState, dispatch, renderTooltip };
  }

  it('handles native allocations', () => {
    const {
      profile,
      funcNamesDict,
    } = getProfileWithUnbalancedNativeAllocations();
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

  describe('with page information', function() {
    function setupWithPageInformation(pageUrl: string, iframeUrl?: string) {
      const {
        profile,
        funcNamesDictPerThread: [funcNamesDict],
      } = getProfileFromTextSamples(`
        A
        Bjs
        Cjs
      `);
      const threadIndex = 0;
      // Add items to Pages array.
      profile.pages = [
        {
          browsingContextID: 1,
          innerWindowID: 111111,
          url: pageUrl,
          embedderInnerWindowID: 0,
        },
      ];

      if (iframeUrl) {
        profile.pages.push({
          browsingContextID: 1,
          innerWindowID: 123123,
          url: iframeUrl,
          embedderInnerWindowID: 111111,
        });
      }

      const { frameTable } = profile.threads[threadIndex];

      for (let i = 1; i < frameTable.length; i++) {
        frameTable.innerWindowID[i] =
          profile.pages[profile.pages.length - 1].innerWindowID;
      }

      const callNodePath = ['A', 'Bjs', 'Cjs'].map(name => funcNamesDict[name]);
      const { dispatch, renderTooltip } = setup(profile);
      dispatch(changeSelectedCallNode(threadIndex, callNodePath));
      const renderResults = renderTooltip();
      return {
        ...renderResults,
        pageUrl,
        iframeUrl,
      };
    }

    it('displays Page URL for non-iframe pages', () => {
      const pageUrl = 'https://developer.mozilla.org/en-US/';
      const { getByText, container } = setupWithPageInformation(pageUrl);

      expect(getByText(pageUrl)).toBeTruthy();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('displays Page URL for iframe pages', () => {
      const pageUrl = 'https://developer.mozilla.org/en-US/';
      const iframeUrl = 'https://iframe.example.com/';
      const { getByText, container } = setupWithPageInformation(
        pageUrl,
        iframeUrl
      );

      expect(getByText(iframeUrl)).toBeTruthy();
      expect(getByText(pageUrl)).toBeTruthy();
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
