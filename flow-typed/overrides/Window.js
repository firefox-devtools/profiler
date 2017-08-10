/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { IDBFactory } from '../../src/types/indexeddb';

type Lib = { debugName: string };

declare class SymbolTable {
  constructor(): SymbolTable,
  getFuncAddressTableForLib(lib: Lib): Promise<Uint32Array>,
  getSymbolsForAddressesInLib(
    requestedAddressesIndices: number[],
    lib: Lib
  ): Promise<string[]>,
}

declare class GeckoProfiler {
  getProfile: () => Object,
  getSymbolTable: (
    debugName: string,
    breakpadId: string
  ) => Promise<SymbolTable>,
}

declare class Window extends EventTarget {
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
  IDBKeyRange: IDBKeyRange,
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
