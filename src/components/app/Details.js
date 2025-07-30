/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { TabBar } from './TabBar';
import { LocalizedErrorBoundary } from './ErrorBoundary';
import { ProfileCallTreeView } from 'firefox-profiler/components/calltree/ProfileCallTreeView';
import { MarkerTable } from 'firefox-profiler/components/marker-table';
import { StackChart } from 'firefox-profiler/components/stack-chart/';
import { MarkerChart } from 'firefox-profiler/components/marker-chart/';
import { NetworkChart } from 'firefox-profiler/components/network-chart/';
import { FlameGraph } from 'firefox-profiler/components/flame-graph/';
import { JsTracer } from 'firefox-profiler/components/js-tracer/';
import { selectSidebar } from 'firefox-profiler/components/sidebar';

import {
  changeSelectedTab,
  changeSidebarOpenState,
} from 'firefox-profiler/actions/app';
import { getSelectedTab } from 'firefox-profiler/selectors/url-state';
import { getIsSidebarOpen } from 'firefox-profiler/selectors/app';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { CallNodeContextMenu } from 'firefox-profiler/components/shared/CallNodeContextMenu';
import { MaybeMarkerContextMenu } from 'firefox-profiler/components/shared/MarkerContextMenu';
import { toValidTabSlug } from 'firefox-profiler/utils/flow';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';

import './Details.css';

type StateProps = {
  readonly visibleTabs: $ReadOnlyArray<TabSlug>,
  readonly selectedTab: TabSlug,
  readonly isSidebarOpen: boolean,
};

type DispatchProps = {
  readonly changeSelectedTab: typeof changeSelectedTab,
  readonly changeSidebarOpenState: typeof changeSidebarOpenState,
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

const SMALL_SCREEN_WIDTH = 768;

class ProfileViewerImpl extends PureComponent<Props> {
  _onSelectTab = (selectedTab: string) => {
    const { changeSelectedTab } = this.props;
    const tabSlug = toValidTabSlug(selectedTab);
    if (!tabSlug) {
      throw new Error('Attempted to change to a tab that does not exist.');
    }
    changeSelectedTab(tabSlug);
  };

  _onClickSidebarButton = () => {
    const { selectedTab, isSidebarOpen, changeSidebarOpenState } = this.props;
    changeSidebarOpenState(selectedTab, !isSidebarOpen);
  };

  componentDidMount() {
    const width = window.innerWidth;
    const { selectedTab, isSidebarOpen, changeSidebarOpenState } = this.props;

    if (width <= SMALL_SCREEN_WIDTH && isSidebarOpen) {
      changeSidebarOpenState(selectedTab, false);
    }
  }

  render() {
    const { visibleTabs, selectedTab, isSidebarOpen } = this.props;
    const hasSidebar = selectSidebar(selectedTab) !== null;
    return (
      <div className="Details">
        <div className="Details-top-bar">
          <TabBar
            selectedTabSlug={selectedTab}
            visibleTabs={visibleTabs}
            onSelectTab={this._onSelectTab}
          />

          <Localized
            id={
              isSidebarOpen
                ? 'Details--close-sidebar-button'
                : 'Details--open-sidebar-button'
            }
            attrs={{ title: true }}
            vars={{ isSidebarOpen: isSidebarOpen }}
          >
            <button
              className={classNames(
                'sidebar-open-close-button',
                'photon-button',
                'photon-button-ghost',
                {
                  'sidebar-open-close-button-isopen': isSidebarOpen,
                  'sidebar-open-close-button-isclosed': !isSidebarOpen,
                }
              )}
              title={isSidebarOpen ? 'Close the sidebar' : 'Open the sidebar'}
              type="button"
              disabled={!hasSidebar}
              onClick={this._onClickSidebarButton}
            />
          </Localized>
        </div>
        <Localized
          id="Details--error-boundary-message"
          attrs={{ message: true }}
        >
          <LocalizedErrorBoundary
            key={selectedTab}
            message="Uh oh, some unknown error happened in this panel"
          >
            {
              {
                calltree: <ProfileCallTreeView />,
                'flame-graph': <FlameGraph />,
                'stack-chart': <StackChart />,
                'marker-chart': <MarkerChart />,
                'marker-table': <MarkerTable />,
                'network-chart': <NetworkChart />,
                'js-tracer': <JsTracer />,
              }[selectedTab]
            }
          </LocalizedErrorBoundary>
        </Localized>
        <CallNodeContextMenu />
        <MaybeMarkerContextMenu />
      </div>
    );
  }
}

export const Details = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    visibleTabs: selectedThreadSelectors.getUsefulTabs(state),
    selectedTab: getSelectedTab(state),
    isSidebarOpen: getIsSidebarOpen(state),
  }),
  mapDispatchToProps: {
    changeSelectedTab,
    changeSidebarOpenState,
  },
  component: ProfileViewerImpl,
});
