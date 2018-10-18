/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';

import Details from './Details';
import selectSidebar from '../sidebar';

import { invalidatePanelLayout } from '../../actions/app';
import { getSelectedTab } from '../../reducers/url-state';
import { getIsSidebarOpen } from '../../reducers/app';
import explicitConnect from '../../utils/connect';

import type { TabSlug } from '../../app-logic/tabs-handling';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './DetailsContainer.css';

type StateProps = {|
  +selectedTab: TabSlug,
  +isSidebarOpen: boolean,
|};

type DispatchProps = {|
  +invalidatePanelLayout: typeof invalidatePanelLayout,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

function DetailsContainer({
  selectedTab,
  isSidebarOpen,
  invalidatePanelLayout,
}: Props) {
  const Sidebar = isSidebarOpen && selectSidebar(selectedTab);

  return (
    <SplitterLayout
      customClassName="DetailsContainer"
      primaryIndex={1}
      secondaryInitialSize={250}
      onDragEnd={invalidatePanelLayout}
    >
      {Sidebar && <Sidebar />}
      <Details />
    </SplitterLayout>
  );
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    selectedTab: getSelectedTab(state),
    isSidebarOpen: getIsSidebarOpen(state),
  }),
  mapDispatchToProps: {
    invalidatePanelLayout,
  },
  component: DetailsContainer,
};

export default explicitConnect(options);
