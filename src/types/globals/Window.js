/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { IDBFactory, IDBKeyRange } from '../indexeddb';
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';
import type { GoogleAnalytics } from '../../utils/analytics';
import type { MixedObject } from '../utils';
import type { FetchMockJest } from '@fetch-mock/jest';

// Because this type isn't an existing Global type, but still it's useful to
// have it available, we define it with a $ as prfix.
declare type $GeckoProfiler = {
  getProfile: () => MixedObject,
  getSymbolTable: (
    debugName: string,
    breakpadId: string
  ) => Promise<SymbolTableAsTuple>,
};

declare class WebChannelEvent {
  detail: {
    id: string,
    message: mixed,
  };
}

declare class Window {
  // Google Analytics
  ga?: GoogleAnalytics;
  // profiler.firefox.com and globals injected via frame scripts.
  geckoProfilerPromise: Promise<$GeckoProfiler>;
  connectToGeckoProfiler: ($GeckoProfiler) => void;

  // For debugging purposes, allow tooltips to persist. This aids in inspecting
  // the DOM structure.
  persistTooltips?: boolean;

  // WebChannel events.
  // https://searchfox.org/mozilla-central/source/toolkit/modules/WebChannel.sys.mjs
  addEventListener: $PropertyType<EventTarget, 'addEventListener'> &
    ((
      'WebChannelMessageToContent',
      (event: WebChannelEvent) => void,
      true
    ) => void) &
    (('message', (event: MessageEvent) => void) => void);

  removeEventListener: $PropertyType<EventTarget, 'removeEventListener'> &
    ((
      'WebChannelMessageToContent',
      (event: WebChannelEvent) => void,
      true
    ) => void) &
    (('message', (event: MessageEvent) => void) => void);

  // Built-ins.
  dispatchEvent: $PropertyType<EventTarget, 'dispatchEvent'>;
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
  fetchMock: FetchMockJest /* only used in tests */;
  requestIdleCallback: typeof requestIdleCallback;
  requestAnimationFrame: typeof requestAnimationFrame;
  devicePixelRatio: number;
  // The indexedDB is marked as optional, as we should handle the test environment
  // where this is not available. It can lead to hard to debug promise failure
  // messages.
  indexedDB?: IDBFactory;
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
    platform: string,
  };
  postMessage: (message: any, targetOrigin: string) => void;
  matchMedia: (matchMedia: string) => MediaQueryList;
}

declare var window: Window;
