/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import SplitterLayout from 'react-splitter-layout';
import { MarkerChart } from '../marker-chart';
import { FlowPanel } from '../flow-panel';

import './index.css';

export function MarkerChartTab() {
  return (
    <div
      className="markerChartTabContainer"
      id="marker-chart-tab"
      role="tabpanel"
      aria-labelledby="marker-chart-tab-button"
    >
      <SplitterLayout
        customClassName="markerChartTabSplitter"
        vertical
        // The MarkerChart is primary.
        primaryIndex={0}
        percentage={true}
        // The FlowPanel is secondary.
        secondaryInitialSize={20}
      >
        <MarkerChart />
        <FlowPanel />
      </SplitterLayout>
    </div>
  );
}
