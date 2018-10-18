/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';
import CallTreeSidebar from '../sidebar/CallTreeSidebar';
import CallTree from './CallTree';
import StackSettings from '../shared/StackSettings';
import TransformNavigator from '../shared/TransformNavigator';
import SelectedThreadActivityGraph from '../shared/thread/SelectedActivityGraph';
import { invalidatePanelLayout } from '../../actions/app';
import explicitConnect from '../../utils/connect';
import './index.css';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {|
  // Allow tests to not render the thread activity graph.
  +hideThreadActivityGraph?: boolean,
|};

type DispatchProps = {|
  +invalidatePanelLayout: typeof invalidatePanelLayout,
|};

type Props = ConnectedProps<OwnProps, {||}, DispatchProps>;

const ProfileCallTreeView = (props: Props) => (
  <div className="treeAndSidebarWrapper">
    <StackSettings />
    <TransformNavigator />
    <SplitterLayout
      customClassName="callTreeSplitter"
      primaryIndex={1}
      secondaryInitialSize={250}
      onDragEnd={invalidatePanelLayout}
    >
      <CallTreeSidebar />
      <div className="callTreeSplitterPrimaryContainer">
        {props && props.hideThreadActivityGraph ? null : (
          <SelectedThreadActivityGraph />
        )}
        <CallTree />
      </div>
    </SplitterLayout>
  </div>
);

const options: ExplicitConnectOptions<OwnProps, {||}, DispatchProps> = {
  mapDispatchToProps: {
    invalidatePanelLayout,
  },
  component: ProfileCallTreeView,
};

export default explicitConnect(options);
