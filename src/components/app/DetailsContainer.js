/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';

import Details from './Details';
import selectSidebar from '../sidebar';

import { invalidatePanelLayout } from '../../actions/app';
import { getSelectedTab, getIsSidebarOpen } from 'selectors';
import explicitConnect from '../../utils/connect';

import type { TabSlug } from '../../app-logic/tabs-handling';
import type { ConnectedProps } from '../../utils/connect';

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
  const Sidebar = selectSidebar(selectedTab);

  return (
    <SplitterLayout
      customClassName="DetailsContainer"
      percentage
      secondaryInitialSize={20}
      onDragEnd={invalidatePanelLayout}
    >
      <Details />
      {Sidebar && isSidebarOpen ? <Sidebar /> : null}
    </SplitterLayout>
  );
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    selectedTab: getSelectedTab(state),
    isSidebarOpen: getIsSidebarOpen(state),
  }),
  mapDispatchToProps: {
    invalidatePanelLayout,
  },
  component: DetailsContainer,
});
