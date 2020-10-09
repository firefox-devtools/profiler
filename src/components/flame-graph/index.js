/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import StackSettings from 'firefox-profiler/components/shared/StackSettings';
import TransformNavigator from 'firefox-profiler/components/shared/TransformNavigator';
import MaybeFlameGraph from 'firefox-profiler/components/flame-graph/MaybeFlameGraph';

const FlameGraphView = () => (
  <div
    className="flameGraph"
    id="flame-graph-tab"
    role="tabpanel"
    aria-labelledby="flame-graph-tab-button"
  >
    <StackSettings hideInvertCallstack={true} />
    <TransformNavigator />
    <MaybeFlameGraph />
  </div>
);

export default FlameGraphView;
