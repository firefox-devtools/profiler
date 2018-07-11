/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { IDBFactory, IDBKeyRange } from '../indexeddb';
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';
import type { GoogleAnalytics } from '../../utils/analytics';

declare type GeckoProfiler = {
  getProfile: () => Object,
  getSymbolTable: (
    debugName: string,
    breakpadId: string
  ) => Promise<SymbolTableAsTuple>,
};

declare class Window extends EventTarget {
  // Google Analytics
  ga?: GoogleAnalytics;
  // perf.html and Gecko Profiler Addon
  geckoProfilerPromise: Promise<GeckoProfiler>;
  connectToGeckoProfiler: GeckoProfiler => void;
  geckoProfilerAddonInstalled?: () => void;
  isGeckoProfilerAddonInstalled?: boolean;
  InstallTrigger?: {
    install: Object => {},
  };

  // Built-ins.
  getComputedStyle: (
    element: HTMLElement,
    pseudoEl: ?string
  ) => CSSStyleDeclaration;
  TextDecoder: typeof TextDecoder;
  setTimeout: typeof setTimeout;
  crypto: {
    // This is a definition of only the methods we use.
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
    subtle: {
      digest: (string, Uint8Array) => Promise<ArrayBuffer>,
    },
  };
  fetch: typeof fetch;
  DOMRect: typeof DOMRect;
  requestIdleCallback: typeof requestIdleCallback;
  requestAnimationFrame: typeof requestAnimationFrame;
  devicePixelRatio: number;
  indexedDB: IDBFactory;
  IDBKeyRange: IDBKeyRange<>;
  innerWidth: number;
  innerHeight: number;
  location: Location;
  open: (url: string, windowName: string, windowFeatures: ?string) => Window;
  history: History;
  Worker: typeof Worker;
  WheelEvent: WheelEvent;
  navigator: {
    userAgent: string,
  };
}

declare var window: Window;
