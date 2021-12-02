/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { oneLine } from 'common-tags';
import {
  getProfileViaWebChannel,
  getSymbolTableViaWebChannel,
  querySupportsGetProfileAndSymbolicationViaWebChannel,
} from './web-channel';

/**
 * This file manages the communication between the profiler and the browser.
 */

export type BrowserConnectionStatus =
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

  // Get a symbol table from the browser.
  getSymbolTable(
    debugName: string,
    breakpadId: string
  ): Promise<SymbolTableAsTuple>;
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
  _geckoProfiler: $GeckoProfiler | void;

  constructor(webChannelSupportsGetProfileAndSymbolication: boolean) {
    this._webChannelSupportsGetProfileAndSymbolication =
      webChannelSupportsGetProfileAndSymbolication;
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
}

function _isFirefox(userAgent: string): boolean {
  return Boolean(userAgent.match(/Firefox\/\d+\.\d+/));
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
    const webChannelSupportsGetProfileAndSymbolication = await Promise.race([
      querySupportsGetProfileAndSymbolicationViaWebChannel(),
      makeTimeoutRejectionPromise(5000),
    ]);
    // If we get here, it means querySupportsGetProfileAndSymbolicationViaWebChannel()
    // did not throw an exception. This means that a WebChannel exists.
    const browserConnection = new BrowserConnectionImpl(
      webChannelSupportsGetProfileAndSymbolication
    );
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
