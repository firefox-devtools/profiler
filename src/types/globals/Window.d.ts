/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { SymbolTableAsTuple } from '../../profile-logic/symbol-store-db';
import type { GoogleAnalytics } from '../../utils/analytics';
import type FetchMock from 'fetch-mock';

declare global {
  // Because this type isn't an existing Global type, but still it's useful to
  // have it available, we define it with a $ as prfix.
  interface $GeckoProfiler {
    getProfile: () => unknown;
    getSymbolTable: (
      debugName: string,
      breakpadId: string
    ) => Promise<SymbolTableAsTuple>;
  }

  interface WebChannelEvent {
    detail: {
      id: string;
      message: unknown;
    };
  }

  interface Window {
    useDarkMode?: () => void;
    useLightMode?: () => void;

    // Google Analytics
    ga?: GoogleAnalytics;
    // profiler.firefox.com and globals injected via frame scripts.
    geckoProfilerPromise: Promise<$GeckoProfiler>;
    connectToGeckoProfiler: (profiler: $GeckoProfiler) => void;

    // For debugging purposes, allow tooltips to persist. This aids in inspecting
    // the DOM structure.
    persistTooltips?: boolean;

    // Test-only
    fetchMock: typeof FetchMock;
  }
}
