/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';

import Details from './Details';
import selectSidebar from '../sidebar';

import { getSelectedTab } from '../../reducers/url-state';
import explicitConnect from '../../utils/connect';

import type { TabSlug } from '../../types/actions';
import type { ExplicitConnectOptions } from '../../utils/connect';

import './DetailsContainer.css';

function dispatchResizeEvent() {
  const event = new UIEvent('resize', { view: window });
  window.dispatchEvent(event);
}

type StateProps = {|
  +selectedTab: TabSlug,
|};

function DetailsContainer({ selectedTab }: StateProps) {
  const Sidebar = selectSidebar(selectedTab);

  return (
    <SplitterLayout
      customClassName="DetailsContainer"
      percentage
      secondaryInitialSize={20}
      onDragEnd={dispatchResizeEvent}
    >
      <Details />
      {Sidebar && <Sidebar />}
    </SplitterLayout>
  );
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    selectedTab: getSelectedTab(state),
  }),
  component: DetailsContainer,
};

export default explicitConnect(options);
