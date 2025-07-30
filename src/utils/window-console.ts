/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { stripIndent, oneLine } from 'common-tags';
import { GetState, Dispatch, MixedObject } from 'firefox-profiler/types';
import { selectorsForConsole } from 'firefox-profiler/selectors';
import actions from 'firefox-profiler/actions';
import { shortenUrl } from 'firefox-profiler/utils/shorten-url';
import { createBrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import { formatTimestamp } from 'firefox-profiler/utils/format-numbers';

// Despite providing a good libdef for Object.defineProperty, Flow still
// special-cases the `value` property: if it's missing it throws an error. Using
// this indirection seems to work around this issue.
// See https://github.com/facebook/flow/issues/285
const defineProperty = Object.defineProperty;

/**
 * This function adds various values from the Redux Store to the window object so that
 * people can access useful things.
 */
export function addDataToWindowObject(
  getState: GetState,
  dispatch: Dispatch,
  target: MixedObject = window as unknown as MixedObject
) {
  defineProperty(target, 'profile', {
    enumerable: true,
    get() {
      return selectorsForConsole.profile.getProfile(getState());
    },
  });

  defineProperty(target, 'filteredThread', {
    enumerable: true,
    get() {
      return selectorsForConsole.selectedThread.getFilteredThread(getState());
    },
  });

  defineProperty(target, 'callTree', {
    enumerable: true,
    get() {
      return selectorsForConsole.selectedThread.getCallTree(getState());
    },
  });

  defineProperty(target, 'filteredMarkers', {
    enumerable: true,
    get() {
      const state = getState();
      const getMarker =
        selectorsForConsole.selectedThread.getMarkerGetter(state);
      const markerIndexes =
        selectorsForConsole.selectedThread.getPreviewFilteredMarkerIndexes(
          state
        );
      return markerIndexes.map(getMarker);
    },
  });

  defineProperty(target, 'selectedMarker', {
    enumerable: true,
    get() {
      return selectorsForConsole.selectedThread.getSelectedMarker(getState());
    },
  });

  target.experimental = {
    enableEventDelayTracks() {
      const areEventDelayTracksEnabled = dispatch(
        actions.enableEventDelayTracks()
      );
      if (areEventDelayTracksEnabled) {
        console.log(stripIndent`
          ✅ The event delay tracks are now enabled and should be displayed in the timeline.
          👉 Note that this is an experimental feature that might still have bugs.
          💡 As an experimental feature their presence isn't persisted as a URL parameter like the other things.
        `);
      }
    },

    enableCPUGraphs() {
      const areExperimentalCPUGraphsEnabled = dispatch(
        actions.enableExperimentalCPUGraphs()
      );
      if (areExperimentalCPUGraphsEnabled) {
        console.log(stripIndent`
          ✅ The CPU graphs are now enabled and should be displayed in the timeline.
          👉 Note that this is an experimental feature that might still have bugs.
          💡 As an experimental feature their presence isn't persisted as a URL parameter like the other things.
        `);
      }
    },

    enableProcessCPUTracks() {
      const areExperimentalProcessCPUTracksEnabled = dispatch(
        actions.enableExperimentalProcessCPUTracks()
      );
      if (areExperimentalProcessCPUTracksEnabled) {
        console.log(stripIndent`
          ✅ The process CPU tracks are now enabled and should be displayed in the timeline.
          👉 Note that this is an experimental feature that might still have bugs.
          💡 As an experimental feature their presence isn't persisted as a URL parameter like the other things.
        `);
      }
    },
  };

  target.togglePseudoLocalization = function (pseudoStrategy?: string) {
    if (
      pseudoStrategy !== undefined &&
      pseudoStrategy !== 'accented' &&
      pseudoStrategy !== 'bidi'
    ) {
      console.log(stripIndent`
        ❗ The pseudo strategy "${pseudoStrategy}" is unknown.
        💡 Valid strategies are: "accented" or "bidi".
        Please try again 😊
      `);
      return;
    }

    dispatch(actions.togglePseudoStrategy(pseudoStrategy ?? null));
    if (pseudoStrategy) {
      console.log(stripIndent`
        ✅ The pseudo strategy "${pseudoStrategy}" is now enabled for the localization.
        👉 To disable it, you can call togglePseudoLocalization() again without a parameter.
      `);
    } else {
      console.log(stripIndent`
        ✅ The pseudo strategy is now disabled.
      `);
    }
  };

  target.toggleTimelineType = function (timelineType?: string) {
    if (
      timelineType !== 'cpu-category' &&
      timelineType !== 'category' &&
      timelineType !== 'stack'
    ) {
      console.log(stripIndent`
        ❗ The timeline type "${timelineType}" is unknown.
        💡 Valid types are: "cpu-category", "category", or "stack".
        Please try again 😊
      `);
      return;
    }

    dispatch(actions.changeTimelineType(timelineType));
    console.log(stripIndent`
      ✅ The timeline type "${timelineType}" is now enabled for the timeline.
    `);
  };

  target.retrieveRawProfileDataFromBrowser = async function (): Promise<
    MixedObject | ArrayBuffer | null
  > {
    // Note that a new connection is created instead of reusing the one in the
    // redux state, as an attempt to make it work even in the worst situations.
    const browserConnectionStatus = await createBrowserConnection();
    const browserConnection = actions.unwrapBrowserConnection(
      browserConnectionStatus
    );
    const rawGeckoProfile = await browserConnection.getProfile({
      onThirtySecondTimeout: () => {
        console.log(
          oneLine`
            We were unable to connect to the browser within thirty seconds.
            This might be because the profile is big or your machine is slower than usual.
            Still waiting...
          `
        );
      },
    });

    return rawGeckoProfile;
  };

  target.saveToDisk = async function (
    unknownObject: ArrayBuffer | unknown,
    filename?: string
  ) {
    if (unknownObject === undefined || unknownObject === null) {
      console.error("We can't save a null or undefined variable.");
      return;
    }

    const arrayBufferOrString =
      typeof unknownObject === 'string' ||
      String(unknownObject) === '[object ArrayBuffer]'
        ? (unknownObject as string | ArrayBuffer)
        : JSON.stringify(unknownObject);

    const blob = new Blob([arrayBufferOrString], {
      type: 'application/octet-stream',
    });
    const blobUrl = URL.createObjectURL(blob);

    // Trigger the download programmatically
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = filename ?? 'profile.data';
    downloadLink.click();

    // Clean up the URL object
    URL.revokeObjectURL(blobUrl);
  };

  // This function extracts MOZ_LOGs saved as markers in a Firefox profile,
  // using the MOZ_LOG canonical format. All logs are saved as a debug log
  // because the log level information isn't saved in these markers.
  target.extractGeckoLogs = function () {
    function pad(p, c) {
      return String(p).padStart(c, '0');
    }

    // This transforms a timestamp to a string as output by mozlog usually.
    function d2s(ts) {
      const d = new Date(ts);
      // new Date rounds down the timestamp (in milliseconds) to the lower integer,
      // let's get the microseconds and nanoseconds differently.
      // This will be imperfect because of float rounding errors but still better
      // than not having them.
      const ns = Math.trunc((ts - Math.trunc(ts)) * 10 ** 6);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}.${pad(d.getUTCMilliseconds(), 3)}${pad(ns, 6)} UTC`;
    }

    const logs = [];

    // This algorithm loops over the raw marker table instead of using the
    // selectors so that the full marker list isn't generated for all the
    // threads in the profile.
    const profile = selectorsForConsole.profile.getProfile(getState());
    const range =
      selectorsForConsole.profile.getPreviewSelectionRange(getState());

    for (const thread of profile.threads) {
      const { markers } = thread;
      for (let i = 0; i < markers.length; i++) {
        const startTime = markers.startTime[i];
        // Note that Log markers are instant markers, so they only have a start time.
        if (
          startTime !== null &&
          markers.data[i] &&
          markers.data[i].type === 'Log' &&
          startTime >= range.start &&
          startTime <= range.end
        ) {
          const data = markers.data[i];
          const strTimestamp = d2s(
            profile.meta.startTime + markers.startTime[i]
          );
          const processName = thread.processName ?? 'Unknown Process';
          // TODO: lying about the log level as it's not available yet in the markers
          const statement = `${strTimestamp} - [${processName} ${thread.pid}: ${thread.name}]: D/${data.module} ${data.name.trim()}`;
          logs.push(statement);
        }
      }
    }

    return logs.sort().join('\n');
  };

  target.totalMarkerDuration = function (markers) {
    if (!Array.isArray(markers)) {
      console.error('totalMarkerDuration expects an array of markers');
      return 0;
    }

    let totalDuration = 0;
    for (const marker of markers) {
      if (
        marker &&
        typeof marker.start === 'number' &&
        typeof marker.end === 'number'
      ) {
        totalDuration += marker.end - marker.start;
      }
      // Skip markers with null end times (instant markers have no duration)
    }

    console.log(`Total marker duration: ${formatTimestamp(totalDuration)}`);
    return totalDuration;
  };

  target.shortenUrl = shortenUrl;
  target.getState = getState;
  target.selectors = selectorsForConsole;
  target.dispatch = dispatch;
  target.actions = actions;

  // For debugging purposes, allow tooltips to persist. This aids in inspecting
  // the DOM structure.
  target.persistTooltips = false;
}

export function logFriendlyPreamble() {
  /**
   * Provide a friendly message to the end user to notify them that they can access certain
   * values from the global window object. These variables are set in an ad-hoc fashion
   * throughout the code.
   */
  const intro = `font-size: 130%;`;
  const bold = `font-weight: bold;`;
  const link = `font-style: italic; text-decoration: underline;`;
  const reset = '';
  console.log(
    // This is gratuitous, I know:
    [
      '%c  __ _           __                                  ',
      ' / _(_)         / _|                                 ',
      '| |_ _ _ __ ___| |_ _____  __                        ',
      "|  _| | '__/ _ \\  _/ _ \\ \\/ /                        ",
      '| | | | | |  __/ || (_) >  <       __ _ _            ',
      '|_| |_|_|  \\___|_| \\___/_/\\_\\     / _(_) |           ',
      '    ,.       ,.   _ __  _ __ ___ | |_ _| | ___ _ _   ',
      "    | \\     / |  | '_ \\| '__/ _ \\|  _| | |/ _ \\ '_|  ",
      '    |/ \\ _ / \\|  | |_) | | | (_) | | | | |  __/ |    ',
      '    |         |  | .__/|_|  \\___/|_| |_|_|\\___|_|    ',
      '    /  -    - \\  |_|                                 ',
      '  ,-    V__V   -.                                    ',
      ' -=  __-  * - .,=-                                   ',
      '  `\\_    -   _/                                      ',
      "      `-----'                                        ",
    ].join('\n'),
    'font-family: Menlo, monospace;'
  );

  console.log(
    stripIndent`
      %cThe following profiler information and tools are available via the console:%c

      %cwindow.profile%c - The currently loaded profile
      %cwindow.filteredThread%c - The current filtered thread
      %cwindow.filteredMarkers%c - The current filtered and processed markers
      %cwindow.selectedMarker%c - The selected processed marker in the current thread
      %cwindow.callTree%c - The call tree of the current filtered thread
      %cwindow.totalMarkerDuration%c - Calculate total duration of a marker array (e.g., totalMarkerDuration(filteredMarkers))
      %cwindow.getState%c - The function that returns the current Redux state.
      %cwindow.selectors%c - All the selectors that are used to get data from the Redux state.
      %cwindow.dispatch%c - The function to dispatch a Redux action to change the state.
      %cwindow.actions%c - All the actions that can be dispatched to change the state.
      %cwindow.experimental%c - The object that holds flags of all the experimental features.
      %cwindow.togglePseudoLocalization%c - Enable pseudo localizations by passing "accented" or "bidi" to this function, or disable using no parameters.
      %cwindow.toggleTimelineType%c - Toggle timeline graph type by passing "cpu-category", "category", or "stack".
      %cwindow.retrieveRawProfileDataFromBrowser%c - Retrieve the profile attached to the current tab and returns it. Use "await" to call it, and use saveToDisk to save it.
      %cwindow.extractGeckoLogs%c - Retrieve recorded logs in the current range, using the MOZ_LOG format. Use with "copy" or "saveToDisk".
      %cwindow.saveToDisk%c - Saves to a file the parameter passed to it, with an optional filename parameter. You can use that to save the profile returned by "retrieveRawProfileDataFromBrowser" or the data returned by "extractGeckoLogs".

      The profile format is documented here:
      %chttps://github.com/firefox-devtools/profiler/blob/main/docs-developer/processed-profile-format.md%c

      The CallTree class's source code is available here:
      %chttps://github.com/firefox-devtools/profiler/blob/main/src/profile-logic/call-tree.js%c
    `,
    // "The following profiler..."
    intro,
    reset,
    // "window.profile"
    bold,
    reset,
    // "window.filteredThread"
    bold,
    reset,
    // "window.filteredMarkers"
    bold,
    reset,
    // "window.selectedMarker"
    bold,
    reset,
    // "window.callTree"
    bold,
    reset,
    // "window.totalMarkerDuration"
    bold,
    reset,
    // "window.getState"
    bold,
    reset,
    // "window.selectors"
    bold,
    reset,
    // "window.dispatch"
    bold,
    reset,
    // "window.actions"
    bold,
    reset,
    // "window.experimental"
    bold,
    reset,
    // "window.togglePseudoLocalization"
    bold,
    reset,
    // "window.toggleTimelineType"
    bold,
    reset,
    // "window.retrieveRawProfileDataFromBrowser"
    bold,
    reset,
    // "window.extractGeckoLogs"
    bold,
    reset,
    // "window.saveToDisk"
    bold,
    reset,
    // "processed-profile-format.md"
    link,
    reset,
    // "call-tree.js"
    link,
    reset
  );
}

export function logDevelopmentTips() {
  console.log('To debug tooltips, set window.persistTooltips to true.');
}