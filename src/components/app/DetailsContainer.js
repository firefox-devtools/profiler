/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';

import { Details } from './Details';
import { selectSidebar } from 'firefox-profiler/components/sidebar';

import { invalidatePanelLayout } from 'firefox-profiler/actions/app';
import { getSelectedTab } from 'firefox-profiler/selectors/url-state';
import { getIsSidebarOpen } from 'firefox-profiler/selectors/app';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './DetailsContainer.css';

type StateProps = {
  readonly selectedTab: TabSlug,
  readonly isSidebarOpen: boolean,
};

type DispatchProps = {
  readonly invalidatePanelLayout: typeof invalidatePanelLayout,
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

function DetailsContainerImpl({
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

export const DetailsContainer = explicitConnect<
  {},
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state) => ({
    selectedTab: getSelectedTab(state),
    isSidebarOpen: getIsSidebarOpen(state),
  }),
  mapDispatchToProps: {
    invalidatePanelLayout,
  },
  component: DetailsContainerImpl,
});
