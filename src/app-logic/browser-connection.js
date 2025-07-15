/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { oneLine } from 'common-tags';
import {
  getProfileViaWebChannel,
  getExternalMarkersViaWebChannel,
  getExternalPowerTracksViaWebChannel,
  getSymbolTableViaWebChannel,
  queryWebChannelVersionViaWebChannel,
  querySymbolicationApiViaWebChannel,
  getPageFaviconsViaWebChannel,
  showFunctionInDevtoolsViaWebChannel,
} from './web-channel';
import type { Milliseconds, FaviconData } from 'firefox-profiler/types';

/**
 * This file manages the communication between the profiler and the browser.
 */

export type BrowserConnectionStatus =
  // The initial state.
  | {| status: 'NO_ATTEMPT' |}
  // In non-Firefox browsers we don't attempt to establish a connection.
  // This is determined via the userAgent.
  | {| status: 'NOT_FIREFOX' |}
  // We are in Firefox, and have sent the initial WebChannel event.
  | {| status: 'WAITING' |}
  // We are in Firefox but the WebChannel connection has been denied.
  // This usually means that this profiler instance is running on a
  // different host than the one that's specified in the
  // preference `devtools.performance.recording.ui-base-url`.
  | {| status: 'DENIED', error: Error |}
  // We are in Firefox but the WebChannel did not respond within 5 seconds.
  // This is unexpected. It could mean that we are running in an old Firefox
  // (older than Firefox 76) which did not have a profiler WebChannel.
  | {| status: 'TIMED_OUT' |}
  // The WebChannel connection has been established.
  | {| status: 'ESTABLISHED', browserConnection: BrowserConnection |};

/**
 * The interface of communication with the browser. Can be backed by a WebChannel
 * or by the frame script API.
 * Only exists if at least an old version of the WebChannel is available in this browser.
 */
export interface BrowserConnection {
  // Get the profile for this tab from the browser.
  getProfile(options: {|
    onThirtySecondTimeout: () => void,
  |}): Promise<ArrayBuffer | MixedObject>;

  getExternalMarkers(
    startTime: Milliseconds,
    endTime: Milliseconds
  ): Promise<MixedObject>;

  getExternalPowerTracks(
    startTime: Milliseconds,
    endTime: Milliseconds
  ): Promise<MixedObject>;

  // Query the browser-internal symbolication API. This provides richer
  // information than getSymbolTable.
  querySymbolicationApi(path: string, requestJson: string): Promise<string>;

  // Get a symbol table from the browser.
  getSymbolTable(
    debugName: string,
    breakpadId: string
  ): Promise<SymbolTableAsTuple>;

  getPageFavicons(pageUrls: Array<string>): Promise<Array<FaviconData | null>>;

  showFunctionInDevtools(
    tabID: number,
    scriptUrl: string,
    line: number | null,
    column: number | null
  ): Promise<void>;
}

/**
 * The regular implementation of the BrowserConnection interface.
 *
 * Only created when a WebChannel exists. But it could be an old WebChannel
 * (from a pre-bug 1625309 Firefox version) which does not support obtaining
 * the profile or symbols. So this class also supports the frame script.
 */
class BrowserConnectionImpl implements BrowserConnection {
  _webChannelSupportsGetProfileAndSymbolication: boolean;
  _webChannelSupportsGetExternalPowerTracks: boolean;
  _webChannelSupportsGetExternalMarkers: boolean;
  _webChannelSupportsGetPageFavicons: boolean;
  _webChannelSupportsOpenDebuggerInTab: boolean;
  _geckoProfiler: $GeckoProfiler | void;

  constructor(webChannelVersion: number) {
    this._webChannelSupportsGetProfileAndSymbolication = webChannelVersion >= 1;
    this._webChannelSupportsGetExternalPowerTracks = webChannelVersion >= 2;
    this._webChannelSupportsGetExternalMarkers = webChannelVersion >= 3;
    this._webChannelSupportsGetPageFavicons = webChannelVersion >= 4;
    this._webChannelSupportsOpenDebuggerInTab = webChannelVersion >= 5;
  }

  // Only called when we must obtain the profile from the browser, i.e. if we
  // cannot proceed without a connection to the browser. This method falls back
  // to the frame script API (window.geckoProfilerPromise) if this browser has
  // an old version of the WebChannel.
  async _getConnectionViaFrameScript(): Promise<$GeckoProfiler> {
    if (!this._geckoProfiler) {
      this._geckoProfiler = await window.geckoProfilerPromise;
    }
    return this._geckoProfiler;
  }

  async getProfile(options: {|
    onThirtySecondTimeout: () => void,
  |}): Promise<ArrayBuffer | MixedObject> {
    const timeoutId = setTimeout(options.onThirtySecondTimeout, 30000);

    // On Firefox 96 and above, we can get the profile from the WebChannel.
    if (this._webChannelSupportsGetProfileAndSymbolication) {
      const profile = await getProfileViaWebChannel();
      clearTimeout(timeoutId);
      return profile;
    }

    // For older versions, fall back to the geckoProfiler frame script API.
    // This fallback can be removed once the oldest supported Firefox ESR version is 96 or newer.
    const geckoProfiler = await this._getConnectionViaFrameScript();
    const profile = await geckoProfiler.getProfile();
    clearTimeout(timeoutId);
    return profile;
  }

  async getExternalMarkers(
    startTime: Milliseconds,
    endTime: Milliseconds
  ): Promise<MixedObject> {
    // On Firefox 125 and above, we can get additional global markers recorded outside the browser.
    if (this._webChannelSupportsGetExternalMarkers) {
      return getExternalMarkersViaWebChannel(startTime, endTime);
    }

    return [];
  }

  async getExternalPowerTracks(
    startTime: Milliseconds,
    endTime: Milliseconds
  ): Promise<MixedObject> {
    // On Firefox 121 and above, we can get additional power tracks recorded outside the browser.
    if (this._webChannelSupportsGetExternalPowerTracks) {
      return getExternalPowerTracksViaWebChannel(startTime, endTime);
    }

    return [];
  }

  async querySymbolicationApi(
    path: string,
    requestJson: string
  ): Promise<string> {
    // This only works on Firefox 96 and above.
    if (!this._webChannelSupportsGetProfileAndSymbolication) {
      throw new Error(
        "Can't use querySymbolicationApi in Firefox versions with the old WebChannel."
      );
    }

    return querySymbolicationApiViaWebChannel(path, requestJson);
  }

  async showFunctionInDevtools(
    tabID: number,
    scriptUrl: string,
    line: number | null,
    column: number | null
  ): Promise<void> {
    if (!this._webChannelSupportsOpenDebuggerInTab) {
      throw new Error(
        "Can't use showFunctionInDevtools in Firefox versions with the old WebChannel."
      );
    }

    return showFunctionInDevtoolsViaWebChannel(tabID, scriptUrl, line, column);
  }

  async getSymbolTable(
    debugName: string,
    breakpadId: string
  ): Promise<SymbolTableAsTuple> {
    // On Firefox 96 and above, we can get the symbol table from the WebChannel.
    if (this._webChannelSupportsGetProfileAndSymbolication) {
      return getSymbolTableViaWebChannel(debugName, breakpadId);
    }

    // For older versions, fall back to the geckoProfiler frame script API.
    // This fallback can be removed once the oldest supported Firefox ESR version is 96 or newer.
    // Note that we use this._geckoProfiler directly instead of
    // _getConnectionViaFrameScript so that we're not waiting forever when the
    // user opens an unsymbolicated profile with a Firefox that doesn't support
    // the WebChannel.
    if (this._geckoProfiler) {
      return this._geckoProfiler.getSymbolTable(debugName, breakpadId);
    }

    throw new Error(
      'Cannot obtain a symbol table: have neither WebChannel nor a GeckoProfiler object'
    );
  }

  async getPageFavicons(
    pageUrls: Array<string>
  ): Promise<Array<FaviconData | null>> {
    // This is added in Firefox 134.
    if (this._webChannelSupportsGetPageFavicons) {
      return getPageFaviconsViaWebChannel(pageUrls);
    }

    return [];
  }
}

// Should work with:
// Firefox Desktop: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0"
// Thunderbird: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Thunderbird/128.2.3"
// Firefox Android: "Mozilla/5.0 (Android 12; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0"
// Should not work with:
// Chrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
// Safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1'
//
// We could match for Gecko/ but do all Gecko-based browsers support the
// WebChannel? Probably not. Therefore specifically Firefox and Thunderbird are
// looked for, until we find that we need a broader net.
function _isFirefox(userAgent: string): boolean {
  return userAgent.includes('Firefox/') || userAgent.includes('Thunderbird/');
}

class TimeoutError extends Error {
  name = 'TimeoutError';
}

function makeTimeoutRejectionPromise(durationInMs) {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`Timed out after ${durationInMs}ms`));
    }, durationInMs);
  });
}

export async function createBrowserConnection(
  userAgent: string = navigator.userAgent
): Promise<BrowserConnectionStatus> {
  if (!_isFirefox(userAgent)) {
    return { status: 'NOT_FIREFOX' };
  }
  try {
    const webChannelVersion = await Promise.race([
      queryWebChannelVersionViaWebChannel(),
      makeTimeoutRejectionPromise(5000),
    ]);
    // If we get here, it means queryWebChannelVersionViaWebChannel()
    // did not throw an exception. This means that a WebChannel exists.
    const browserConnection = new BrowserConnectionImpl(webChannelVersion);
    return {
      status: 'ESTABLISHED',
      browserConnection,
    };
  } catch (e) {
    if (e instanceof TimeoutError) {
      // The browser never reacted to our WebChannelMessageToChrome event.
      // This can happen if we're running on a browser that's not Firefox, or if we're running
      // on an old version of Firefox which does not have support for any WebChannels.
      return { status: 'TIMED_OUT' };
    }
    // The WebChannel responded with an error. This usually means that this profiler
    // instance is running on a different host than the one that's specified in the
    // preference `devtools.performance.recording.ui-base-url`.
    // Or it means we're running in a test environment where no WebChannel simulation
    // has been set up.
    const error = new Error(oneLine`
       This profiler instance was unable to connect to the
       WebChannel. This usually means that it’s running on a
       different host from the one that is specified in the
       preference devtools.performance.recording.ui-base-url. If
       you would like to capture new profiles with this instance, you can go to about:config
       and change the preference. Error: ${e.name}: ${e.message}
     `);
    return { status: 'DENIED', error };
  }
}
