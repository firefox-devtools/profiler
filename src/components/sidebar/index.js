/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { CallTreeSidebar } from './CallTreeSidebar';
import { MarkerSidebar } from './MarkerSidebar';

import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';

import './sidebar.css';

export function selectSidebar(
  selectedTab: TabSlug
): React.ComponentType<{}> | null {
  return {
    calltree: CallTreeSidebar,
    'flame-graph': CallTreeSidebar,
    'stack-chart': null,
    'marker-chart': null,
    'marker-table': MarkerSidebar, // MarkerSidebar
    'network-chart': null,
    'js-tracer': null,
  }[selectedTab];
}
