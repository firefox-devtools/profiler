/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import SplitterLayout from 'react-splitter-layout';
import { FunctionList } from './FunctionList';
import { LowerWing } from './LowerWing';
import { StackSettings } from 'firefox-profiler/components/shared/StackSettings';
import { TransformNavigator } from 'firefox-profiler/components/shared/TransformNavigator';

import './Butterfly.css';

export const ProfileFunctionListView = () => (
  <div
    className="treeAndSidebarWrapper"
    id="function-list-tab"
    role="tabpanel"
    aria-labelledby="function-list-tab-button"
  >
    <StackSettings />
    <TransformNavigator />
    <div className="butterflyWrapper">
      <SplitterLayout percentage secondaryInitialSize={50}>
        <FunctionList />
        <SplitterLayout percentage vertical secondaryInitialSize={50}>
          <LowerWing />
          <LowerWing />
        </SplitterLayout>
      </SplitterLayout>
    </div>
  </div>
);
