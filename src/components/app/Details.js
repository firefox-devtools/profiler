/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import TabBar from './TabBar';
import ProfileCallTreeView from '../calltree/ProfileCallTreeView';
import MarkerTable from '../marker-table';
import StackChart from '../stack-chart/';
import MarkerChart from '../marker-chart/';
import FlameGraph from '../flame-graph/';
import { changeSelectedTab, changeTabOrder } from '../../actions/app';
import { getTabOrder } from '../../reducers/profile-view';
import { getSelectedTab } from '../../reducers/url-state';
import CallNodeContextMenu from '../shared/CallNodeContextMenu';
import MarkerTableContextMenu from '../marker-table/ContextMenu';
import ProfileThreadHeaderContextMenu from '../header/ProfileThreadHeaderContextMenu';
import { toValidTabSlug } from '../../utils/flow';

import type { Tab } from './TabBar';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { TabSlug } from '../../types/actions';

require('./Details.css');

type StateProps = {|
  +tabOrder: number[],
  +selectedTab: TabSlug,
|};

type DispatchProps = {|
  +changeSelectedTab: typeof changeSelectedTab,
  +changeTabOrder: typeof changeTabOrder,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewer extends PureComponent<Props> {
  // If updating this list, make sure and update the tabOrder reducer with another index.
  _tabs: Tab[] = [
    {
      name: 'calltree',
      title: 'Call Tree',
    },
    {
      name: 'flame-graph',
      title: 'Flame Graph',
    },
    {
      name: 'stack-chart',
      title: 'Stack Chart',
    },
    {
      name: 'marker-chart',
      title: 'Marker Chart',
    },
    {
      name: 'marker-table',
      title: 'Marker Table',
    },
    {
      name: 'network-chart',
      title: 'Network',
    },
  ];

  _onSelectTab = (selectedTab: string) => {
    const { changeSelectedTab } = this.props;
    const tabSlug = toValidTabSlug(selectedTab);
    if (!tabSlug) {
      throw new Error('Attempted to change to a tab that does not exist.');
    }
    changeSelectedTab(tabSlug);
  };

  render() {
    const { tabOrder, changeTabOrder, selectedTab } = this.props;
    return (
      <div className="Details">
        <TabBar
          tabs={this._tabs}
          selectedTabName={selectedTab}
          tabOrder={tabOrder}
          onSelectTab={this._onSelectTab}
          onChangeTabOrder={changeTabOrder}
        />
        {
          {
            calltree: <ProfileCallTreeView />,
            'marker-table': <MarkerTable />,
            'stack-chart': <StackChart />,
            'marker-chart': <MarkerChart />,
            'network-chart': <MarkerChart />,
            'flame-graph': <FlameGraph />,
          }[selectedTab]
        }
        <CallNodeContextMenu />
        <MarkerTableContextMenu />
        <ProfileThreadHeaderContextMenu />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    tabOrder: getTabOrder(state),
    selectedTab: getSelectedTab(state),
  }),
  mapDispatchToProps: {
    changeSelectedTab,
    changeTabOrder,
  },
  component: ProfileViewer,
};

export default explicitConnect(options);
