/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { IDBFactory, IDBKeyRange } from '../indexeddb';
import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';
import type { GoogleAnalytics } from '../../utils/analytics';

// Because this type isn't an existing Global type, but still it's useful to
// have it available, we define it with a $ as prfix.
declare type $GeckoProfiler = {
  getProfile: () => Object,
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

declare class Window extends EventTarget {
  // Google Analytics
  ga?: GoogleAnalytics;
  // profiler.firefox.com and Gecko Profiler Addon
  geckoProfilerPromise: Promise<$GeckoProfiler>;
  connectToGeckoProfiler: $GeckoProfiler => void;
  geckoProfilerAddonInstalled?: () => void;
  isGeckoProfilerAddonInstalled?: boolean;
  InstallTrigger?: {
    install: Object => {},
  };

  // WebChannel events.
  // https://searchfox.org/mozilla-central/source/toolkit/modules/WebChannel.jsm
  addEventListener: $PropertyType<EventTarget, 'addEventListener'> &
    ((
      'WebChannelMessageToContent',
      (event: WebChannelEvent) => void,
      true
    ) => void);

  removeEventListener: $PropertyType<EventTarget, 'removeEventListener'> &
    ((
      'WebChannelMessageToContent',
      (event: WebChannelEvent) => void,
      true
    ) => void);

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
  };
}

declare var window: Window;
