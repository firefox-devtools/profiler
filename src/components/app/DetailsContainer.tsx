/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Details } from './Details';
import { ResizableWithSplitter } from 'firefox-profiler/components/shared/ResizableWithSplitter';
import { selectSidebar } from 'firefox-profiler/components/sidebar';

import { invalidatePanelLayout } from 'firefox-profiler/actions/app';
import { getSelectedTab } from 'firefox-profiler/selectors/url-state';
import { getIsSidebarOpen } from 'firefox-profiler/selectors/app';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './DetailsContainer.css';

type StateProps = {
  readonly selectedTab: TabSlug;
  readonly isSidebarOpen: boolean;
};

type DispatchProps = {
  readonly invalidatePanelLayout: typeof invalidatePanelLayout;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

function DetailsContainerImpl({ selectedTab, isSidebarOpen }: Props) {
  const Sidebar = selectSidebar(selectedTab);

  return (
    <div className="DetailsContainer">
      <Details />
      {Sidebar && isSidebarOpen ? (
        <ResizableWithSplitter
          className="DetailsContainerResizableSidebarWrapper"
          percent={false}
          splitterPosition="start"
          controlledProperty="width"
          initialSize="300px"
        >
          <Sidebar />
        </ResizableWithSplitter>
      ) : null}
    </div>
  );
}

export const DetailsContainer = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    selectedTab: getSelectedTab(state),
    isSidebarOpen: getIsSidebarOpen(state),
  }),
  mapDispatchToProps: {
    invalidatePanelLayout,
  },
  component: DetailsContainerImpl,
});
