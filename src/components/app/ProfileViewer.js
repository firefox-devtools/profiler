/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import TabBar from './TabBar';
import ProfileCallTreeView from '../calltree/ProfileCallTreeView';
import MarkerTable from '../marker-table';
import ProfileFilterNavigator from './ProfileFilterNavigator';
import ProfileSharing from './ProfileSharing';
import SymbolicationStatusOverlay from './SymbolicationStatusOverlay';
import StackChart from '../stack-chart/';
import MarkerChart from '../marker-chart/';
import FlameGraph from '../flame-graph/';
import { changeSelectedTab, changeTabOrder } from '../../actions/app';
import { returnToZipFileList } from '../../actions/zipped-profiles';
import { getTabOrder } from '../../reducers/profile-view';
import { getSelectedTab, getProfileName } from '../../reducers/url-state';
import ProfileViewerHeader from '../header/ProfileViewerHeader';
import CallNodeContextMenu from '../shared/CallNodeContextMenu';
import MarkerTableContextMenu from '../marker-table/ContextMenu';
import ProfileThreadHeaderContextMenu from '../header/ProfileThreadHeaderContextMenu';
import FooterLinks from './FooterLinks';
import { toValidTabSlug } from '../../utils/flow';
import { getHasZipFile } from '../../reducers/zipped-profiles';

import type { Tab } from './TabBar';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./ProfileViewer.css');

type StateProps = {|
  +tabOrder: number[],
  +selectedTab: string,
  +profileName: string | null,
  +hasZipFile: boolean,
|};

type DispatchProps = {|
  +changeSelectedTab: typeof changeSelectedTab,
  +changeTabOrder: typeof changeTabOrder,
  +returnToZipFileList: typeof returnToZipFileList,
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
      tabOrder,
      changeTabOrder,
      selectedTab,
      hasZipFile,
      profileName,
      returnToZipFileList,
    } = this.props;
    return (
      <div className="profileViewer">
        <div className="profileViewerTopBar">
          {hasZipFile ? (
            <button
              type="button"
              className="profileViewerZipButton"
              title="View all files in the zip file"
              onClick={returnToZipFileList}
            />
          ) : null}
          {profileName ? (
            <div className="profileViewerName">{profileName}</div>
          ) : null}
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
            'stack-chart': <StackChart />,
            'marker-chart': <MarkerChart />,
            // The Flame Graph is not shown by the tab bar, but can still be accessed by
            // manually typing "flame-graph" in the URL.
            'flame-graph': <FlameGraph />,
          }[selectedTab]
        }
        <SymbolicationStatusOverlay />
        <CallNodeContextMenu />
        <MarkerTableContextMenu />
        <ProfileThreadHeaderContextMenu />
        <FooterLinks />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    tabOrder: getTabOrder(state),
    selectedTab: getSelectedTab(state),
    profileName: getProfileName(state),
    hasZipFile: getHasZipFile(state),
  }),
  mapDispatchToProps: {
    changeSelectedTab,
    changeTabOrder,
    returnToZipFileList,
  },
  component: ProfileViewer,
};

export default explicitConnect(options);
