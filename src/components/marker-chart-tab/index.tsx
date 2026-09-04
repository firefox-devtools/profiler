/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MarkerChart } from "../marker-chart";
import { FlowPanel } from "../flow-panel";

import "./index.css";
import { ResizableWithSplitter } from "../shared/ResizableWithSplitter";

export function MarkerChartTab() {
  return (
    <div
      className="markerChartTabContainer"
      id="marker-chart-tab"
      role="tabpanel"
      aria-labelledby="marker-chart-tab-button"
    >
      <MarkerChart />
      <ResizableWithSplitter
        splitterPosition="start"
        controlledProperty="height"
        initialSize="20%"
        percent={true}
      >
        <FlowPanel />
      </ResizableWithSplitter>
    </div>
  );
}
