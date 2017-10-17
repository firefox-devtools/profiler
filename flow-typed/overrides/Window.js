/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { IDBFactory, IDBKeyRange } from '../../src/types/indexeddb';
import type { SymbolTableAsTuple } from '../../src/profile-logic/symbol-store-db';

declare class GeckoProfiler {
  getProfile: () => Object,
  getSymbolTable: (
    debugName: string,
    breakpadId: string
  ) => Promise<SymbolTableAsTuple>,
}

// Document Google Analytics API
// https://developers.google.com/analytics/devguides/collection/analyticsjs/pages
type GAEvent = {|
  hitType: 'event',
  // Specifies the event category. Must not be empty
  eventCategory: string,
  eventAction: string,
  eventLabel?: string,
  eventValue?: number,
|};

type GAPageView = {|
  hitType: 'pageview',
  page: location.pathname,
|};

type GATiming = {|
  hitType: 'timing',
  timingCategory: string,
  timingVar: string,
  timingValue: number,
  timingLabel?: string,
|};

type GoogleAnalytics = ('send', GAEvent | GAPageView | GATiming) => {};

declare class Window extends EventTarget {
  // Google Analytics
  ga?: GoogleAnalytics,
  // perf.html and Gecko Profiler Addon
  geckoProfilerPromise: Promise<GeckoProfiler>,
  geckoProfilerAddonInstalled?: () => void,
  isGeckoProfilerAddonInstalled?: boolean,
  legacyRangeFilters: Array<{
    start: number,
    end: number,
  }>,
  InstallTrigger?: {
    install: Object => {},
  },

  // Built-ins.
  getComputedStyle: (
    element: HTMLElement,
    pseudoEl: ?string
  ) => CSSStyleDeclaration,
  DOMRect: typeof DOMRect,
  requestIdleCallback: typeof requestIdleCallback,
  requestAnimationFrame: typeof requestAnimationFrame,
  devicePixelRatio: number,
  indexedDB: IDBFactory,
  IDBKeyRange: IDBKeyRange<>,
  innerWidth: number,
  innerHeight: number,
  location: Location,
  history: History,
  Worker: typeof Worker,
  WheelEvent: WheelEvent,
  navigator: {
    userAgent: string,
  },
}

declare var window: Window;
