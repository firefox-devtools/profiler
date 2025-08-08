/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { StackSettings } from '../shared/StackSettings';
import { TransformNavigator } from '../shared/TransformNavigator';
import { MaybeFlameGraph } from './MaybeFlameGraph';

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

export const FlameGraph = FlameGraphView;
