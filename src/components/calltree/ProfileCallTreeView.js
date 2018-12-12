/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import CallTree from './CallTree';
import StackSettings from '../shared/StackSettings';
import TransformNavigator from '../shared/TransformNavigator';
import SelectedThreadActivityGraph from '../shared/thread/SelectedActivityGraph';

type Props = {|
  // Allow tests to not render the thread activity graph.
  +hideThreadActivityGraph?: boolean,
|};

const ProfileCallTreeView = (props: Props) => (
  <div
    className="treeAndSidebarWrapper"
    id="calltree-tab"
    tabIndex="0"
    role="tabpanel"
    aria-labelledby="calltree"
  >
    <StackSettings />
    <TransformNavigator />
    {props && props.hideThreadActivityGraph ? null : (
      <SelectedThreadActivityGraph />
    )}
    <CallTree />
  </div>
);

export default ProfileCallTreeView;
