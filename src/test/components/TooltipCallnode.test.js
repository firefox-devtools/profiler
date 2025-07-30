/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { TooltipCallNode } from '../../components/tooltip/CallNode';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithUnbalancedNativeAllocations,
  getProfileFromTextSamples,
} from '../fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import * as ProfileSelectors from '../../selectors/profile';
import {
  changeSelectedCallNode,
  changeCallTreeSummaryStrategy,
} from '../../actions/profile-view';
import { ensureExists } from '../../utils/flow';

describe('TooltipCallNode', function () {
  function setup(profile) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    function renderTooltip() {
      const callTree = selectedThreadSelectors.getCallTree(getState());
      const callNodeIndex = ensureExists(
        selectedThreadSelectors.getSelectedCallNodeIndex(getState()),
        'Unable to find a selected call node index.'
      );
      const displayData = callTree.getDisplayData(callNodeIndex);

      // This component is not currently connected.
      return render(
        <Provider store={store}>
          <TooltipCallNode
            thread={selectedThreadSelectors.getThread(getState())}
            weightType="samples"
            innerWindowIDToPageMap={ProfileSelectors.getInnerWindowIDToPageMap(
              getState()
            )}
            callNodeIndex={callNodeIndex}
            callNodeInfo={selectedThreadSelectors.getCallNodeInfo(getState())}
            displayData={displayData}
            categories={ProfileSelectors.getCategories(getState())}
            interval={ProfileSelectors.getProfileInterval(getState())}
            durationText="Fake Duration Text"
            callTreeSummaryStrategy={selectedThreadSelectors.getCallTreeSummaryStrategy(
              getState()
            )}
            displayStackType={true}
          />
        </Provider>
      );
    }
    return { getState, dispatch, renderTooltip };
  }

  it('handles native allocations', () => {
    const {
      profile,
      funcNamesDict: { A, B, Fjs, Gjs },
    } = getProfileWithUnbalancedNativeAllocations();
    const threadIndex = 0;
    const callNodePath = [A, B, Fjs, Gjs];

    const { dispatch, renderTooltip } = setup(profile);
    dispatch(changeSelectedCallNode(threadIndex, callNodePath));
    dispatch(changeCallTreeSummaryStrategy('native-allocations'));
    const { container } = renderTooltip();

    expect(container.firstChild).toMatchSnapshot();
  });

  describe('with page information', function () {
    function setupWithPageInformation({
      pageUrl,
      iframeUrl,
      isPrivateBrowsing,
    }: {
      pageUrl: string,
      iframeUrl?: string,
      isPrivateBrowsing?: boolean,
    }) {
      const {
        profile,
        funcNamesDictPerThread: [{ A, Bjs, Cjs }],
      } = getProfileFromTextSamples(`
        A
        Bjs
        Cjs
      `);
      const threadIndex = 0;
      // Add items to Pages array.
      profile.pages = [
        {
          tabID: 1,
          innerWindowID: 111111,
          url: pageUrl,
          embedderInnerWindowID: 0,
          isPrivateBrowsing,
        },
      ];

      if (iframeUrl) {
        profile.pages.push({
          tabID: 1,
          innerWindowID: 123123,
          url: iframeUrl,
          embedderInnerWindowID: 111111,
          isPrivateBrowsing,
        });
      }

      const { frameTable } = profile.threads[threadIndex];

      for (let i = 1; i < frameTable.length; i++) {
        frameTable.innerWindowID[i] =
          profile.pages[profile.pages.length - 1].innerWindowID;
      }

      const callNodePath = [A, Bjs, Cjs];
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
      const { getByText, container } = setupWithPageInformation({ pageUrl });

      expect(getByText(pageUrl)).toBeInTheDocument();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('displays Page URL for iframe pages', () => {
      const pageUrl = 'https://developer.mozilla.org/en-US/';
      const iframeUrl = 'https://iframe.example.com/';
      const { getByText, container } = setupWithPageInformation({
        pageUrl,
        iframeUrl,
      });

      expect(getByText(iframeUrl)).toBeInTheDocument();
      expect(getByText(pageUrl)).toBeInTheDocument();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('displays the private browsing information', () => {
      const pageUrl = 'https://developer.mozilla.org/en-US/';
      const { getByText } = setupWithPageInformation({
        pageUrl,
        isPrivateBrowsing: true,
      });

      const displayedUrl = getByText(pageUrl, { exact: false });
      expect(displayedUrl).toHaveTextContent(`${pageUrl} (private)`);
    });
  });
});
