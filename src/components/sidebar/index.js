/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import CallTreeSidebar from './CallTreeSidebar';

import type { TabSlug } from '../../types/actions';

import './sidebar.css';

export default function selectSidebar(
  selectedTab: TabSlug
): React.ComponentType<{||}> | null {
  return {
    calltree: CallTreeSidebar,
    'marker-table': null,
    'stack-chart': null,
    'marker-chart': null,
    'flame-graph': CallTreeSidebar,
  }[selectedTab];
}
