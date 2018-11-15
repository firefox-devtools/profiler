/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';

import explicitConnect from '../../utils/connect';
import TabBar from './TabBar';
import ProfileCallTreeView from '../calltree/ProfileCallTreeView';
import MarkerTable from '../marker-table';
import StackChart from '../stack-chart/';
import MarkerChart from '../marker-chart/';
import NetworkChart from '../network-chart/';
import FlameGraph from '../flame-graph/';
import selectSidebar from '../sidebar';

import { changeSelectedTab, changeSidebarOpenState } from '../../actions/app';
import { getSelectedTab } from '../../reducers/url-state';
import { getIsSidebarOpen, getVisibleTabs } from '../../reducers/app';
import CallNodeContextMenu from '../shared/CallNodeContextMenu';
import MarkerTableContextMenu from '../marker-table/ContextMenu';
import TimelineTrackContextMenu from '../timeline/TrackContextMenu';
import { toValidTabSlug } from '../../utils/flow';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { TabSlug } from '../../app-logic/tabs-handling';

import '../../../res/css/photon-components.css';
import './Details.css';

type StateProps = {|
  +visibleTabs: $ReadOnlyArray<TabSlug>,
  +selectedTab: TabSlug,
  +isSidebarOpen: boolean,
|};

type DispatchProps = {|
  +changeSelectedTab: typeof changeSelectedTab,
  +changeSidebarOpenState: typeof changeSidebarOpenState,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewer extends PureComponent<Props> {
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

  render() {
    const { visibleTabs, selectedTab, isSidebarOpen } = this.props;
    const hasSidebar = selectSidebar(selectedTab) !== null;
    const extraButton = hasSidebar && (
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
        onClick={this._onClickSidebarButton}
      />
    );

    return (
      <div className="Details">
        <TabBar
          selectedTabSlug={selectedTab}
          visibleTabs={visibleTabs}
          onSelectTab={this._onSelectTab}
          extraElements={extraButton}
        />
        {
          {
            calltree: <ProfileCallTreeView />,
            'flame-graph': <FlameGraph />,
            'stack-chart': <StackChart />,
            'marker-chart': <MarkerChart />,
            'marker-table': <MarkerTable />,
            'network-chart': <NetworkChart />,
          }[selectedTab]
        }
        <CallNodeContextMenu />
        <MarkerTableContextMenu />
        <TimelineTrackContextMenu />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    visibleTabs: getVisibleTabs(state),
    selectedTab: getSelectedTab(state),
    isSidebarOpen: getIsSidebarOpen(state),
  }),
  mapDispatchToProps: {
    changeSelectedTab,
    changeSidebarOpenState,
  },
  component: ProfileViewer,
};

export default explicitConnect(options);
