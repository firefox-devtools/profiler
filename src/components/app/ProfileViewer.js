/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import explicitConnect from '../../utils/connect';
import TabBar from './TabBar';
import ProfileCallTreeView from '../calltree/ProfileCallTreeView';
import MarkerTable from '../marker-table';
import ProfileTaskTracerView from '../tasktracer/ProfileTaskTracerView';
import ProfileFilterNavigator from './ProfileFilterNavigator';
import ProfileSharing from './ProfileSharing';
import SymbolicationStatusOverlay from './SymbolicationStatusOverlay';
import StackChart from '../stack-chart/';
import MarkerChart from '../marker-chart/';
import { changeSelectedTab, changeTabOrder } from '../../actions/app';
import { getTabOrder, getDisplayRange } from '../../reducers/profile-view';
import { getSelectedTab } from '../../reducers/url-state';
import ProfileViewerHeader from '../header/ProfileViewerHeader';
import ProfileCallTreeContextMenu from '../calltree/ProfileCallTreeContextMenu';
import MarkerTableContextMenu from '../marker-table/ContextMenu';
import ProfileThreadHeaderContextMenu from '../header/ProfileThreadHeaderContextMenu';
import FooterLinks from './FooterLinks';
import { toValidTabSlug } from '../../utils/flow';

import type { StartEndRange } from '../../types/units';
import type { Tab } from './TabBar';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./ProfileViewer.css');

type StateProps = {|
  +tabOrder: number[],
  +selectedTab: string,
  +className: string,
  +timeRange: StartEndRange,
|};

type DispatchProps = {|
  +changeSelectedTab: typeof changeSelectedTab,
  +changeTabOrder: typeof changeTabOrder,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewer extends PureComponent<Props> {
  _tabs: Tab[];

  constructor(props) {
    super(props);
    (this: any)._onSelectTab = this._onSelectTab.bind(this);
    // If updating this list, make sure and update the tabOrder reducer with another index.
    this._tabs = [
      {
        name: 'calltree',
        title: 'Call Tree',
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
    ];
  }

  _onSelectTab(selectedTab: string) {
    const { changeSelectedTab } = this.props;
    const tabSlug = toValidTabSlug(selectedTab);
    if (!tabSlug) {
      throw new Error('Attempted to change to a tab that does not exist.');
    }
    changeSelectedTab(tabSlug);
  }

  render() {
    const {
      className,
      tabOrder,
      timeRange,
      changeTabOrder,
      selectedTab,
    } = this.props;

    return (
      <div className={className}>
        <div className={`${className}TopBar`}>
          <ProfileFilterNavigator />
          <ProfileSharing />
        </div>
        <ProfileViewerHeader />
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
            tasktracer: (
              <ProfileTaskTracerView
                rangeStart={timeRange.start}
                rangeEnd={timeRange.end}
              />
            ),
            'stack-chart': <StackChart />,
            'marker-chart': <MarkerChart />,
          }[selectedTab]
        }
        <SymbolicationStatusOverlay />
        <ProfileCallTreeContextMenu />
        <MarkerTableContextMenu />
        <ProfileThreadHeaderContextMenu />
        <FooterLinks />
      </div>
    );
  }
}

ProfileViewer.propTypes = {
  className: PropTypes.string.isRequired,
  tabOrder: PropTypes.arrayOf(PropTypes.number).isRequired,
  timeRange: PropTypes.object.isRequired,
  selectedTab: PropTypes.string.isRequired,
  changeSelectedTab: PropTypes.func.isRequired,
  changeTabOrder: PropTypes.func.isRequired,
};

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    tabOrder: getTabOrder(state),
    selectedTab: getSelectedTab(state),
    className: 'profileViewer',
    timeRange: getDisplayRange(state),
  }),
  mapDispatchToProps: {
    changeSelectedTab,
    changeTabOrder,
  },
  component: ProfileViewer,
};

export default explicitConnect(options);
