/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FunctionList } from './FunctionList';
import { LowerWing } from './LowerWing';
import { StackSettings } from 'firefox-profiler/components/shared/StackSettings';
import { TransformNavigator } from 'firefox-profiler/components/shared/TransformNavigator';
import { ResizableWithSplitter } from '../shared/ResizableWithSplitter';

import './Butterfly.css';

export const ProfileFunctionListView = () => (
  <div
    className="treeAndSidebarWrapper"
    id="function-list-tab"
    role="tabpanel"
    aria-labelledby="function-list-tab-button"
  >
    <StackSettings hideInvertCallstack />
    <TransformNavigator />
    <div className="butterflyWrapper">
      <FunctionList />
      <ResizableWithSplitter
        className="butterflyWings"
        splitterPosition="start"
        controlledProperty="width"
        percent={true}
        initialSize="50%"
      >
        <LowerWing />
        <LowerWing />
      </ResizableWithSplitter>
    </div>
  </div>
);
