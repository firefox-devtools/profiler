/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import StackSettings from '../shared/StackSettings';
import TransformNavigator from '../shared/TransformNavigator';
import MaybeFlameGraph from './MaybeFlameGraph';

const FlameGraphView = () => (
  <div className="flameGraph">
    <StackSettings hideInvertCallstack={true} />
    <TransformNavigator />
    <MaybeFlameGraph />
  </div>
);

export default FlameGraphView;
