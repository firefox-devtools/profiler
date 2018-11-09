/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * This object contains all our tab slugs with their associated title. This is
 * the "master list of tabs". This is in object form because that's how we can
 * easily derive the TabSlug type with Flow.
 */
export const tabsWithTitle = {
  calltree: 'Call Tree',
  'flame-graph': 'Flame Graph',
  'stack-chart': 'Stack Chart',
  'marker-chart': 'Marker Chart',
  'marker-table': 'Marker Table',
  'network-chart': 'Network',
};

export type TabSlug = $Keys<typeof tabsWithTitle>;
export type TabWithTitle = {| name: TabSlug, title: string |};

/**
 * This array contains the list of all tab slugs that we use as codes throughout
 * the codebase, and especially in the URL.
 */
export const tabSlugs: $ReadOnlyArray<TabSlug> =
  // getOwnPropertyNames is guaranteed to keep the order in which properties
  // were defined, and this order is important for us.
  Object.getOwnPropertyNames(tabsWithTitle);

/**
 * This array contains the same data as tabsWithTitle above, but in an ordered
 * array so that we can use it directly in some of our components.
 */
export const tabsWithTitleArray: $ReadOnlyArray<TabWithTitle> = tabSlugs.map(
  tabSlug => ({
    name: tabSlug,
    title: tabsWithTitle[tabSlug],
  })
);
