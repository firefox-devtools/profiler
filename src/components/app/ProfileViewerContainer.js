/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';

import ProfileViewer from './ProfileViewer';
import selectSidebar from '../sidebar';

import { getSelectedTab } from '../../reducers/url-state';
import explicitConnect from '../../utils/connect';

import type { TabSlug } from '../../types/actions';
import type { ExplicitConnectOptions } from '../../utils/connect';

import './ProfileViewerContainer.css';

function dispatchResizeEvent() {
  const event = new UIEvent('resize', { view: window });
  window.dispatchEvent(event);
}

type StateProps = {|
  +selectedTab: TabSlug,
|};

function ProfileViewerContainer({ selectedTab }: StateProps) {
  const Sidebar = selectSidebar(selectedTab);

  /* Note: we use `primaryMinSize` to control the display of the sidebar, instead
   * of `secondaryInitialSize`, because the component SplitterLayout doesn't react
   * to changes to `secondaryInitialSize`.
   * See https://github.com/zesik/react-splitter-layout/issues/14
   */
  return (
    <SplitterLayout
      customClassName="ProfileViewerContainer"
      percentage
      secondaryInitialSize={20}
      onDragEnd={dispatchResizeEvent}
    >
      <ProfileViewer />
      {Sidebar && <Sidebar />}
    </SplitterLayout>
  );
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    selectedTab: getSelectedTab(state),
  }),
  component: ProfileViewerContainer,
};

export default explicitConnect(options);
