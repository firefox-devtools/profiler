/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import queryString from 'query-string';
import {
  stringifyCommittedRanges,
  parseCommittedRanges,
} from '../profile-logic/committed-ranges';
import {
  stringifyTransforms,
  parseTransforms,
} from '../profile-logic/transforms';
import {
  assertExhaustiveCheck,
  toValidTabSlug,
  ensureExists,
} from '../utils/flow';
import { toValidCallTreeSummaryStrategy } from '../profile-logic/profile-data';
import { oneLine } from 'common-tags';
import type { UrlState } from '../types/state';
import type { DataSource } from '../types/actions';
import type {
  Pid,
  Profile,
  Thread,
  IndexIntoStackTable,
} from '../types/profile';
import type { TrackIndex, CallNodePath } from '../types/profile-derived';

export const CURRENT_URL_VERSION = 4;

/**
 * This static piece of state might look like an anti-pattern, but it's a relatively
 * simple way to adjust whether we are pushing or replacing onto the history API.
 * The history API is a singleton, and so here we're also using a singleton pattern
 * to manage this bit of state.
 */
let _isReplaceState: boolean = false;

/**
 * This function can be called from thunk actions or other components to change the
 * history API's behavior.
 */
export function setHistoryReplaceState(value: boolean): void {
  _isReplaceState = value;
}

/**
 * This function is consumed by the UrlManager so it knows how to interact with the
 * history API. It's embedded here to avoid cyclical dependencies when importing files.
 */
export function getIsHistoryReplaceState(): boolean {
  return _isReplaceState;
}

function getDataSourceDirs(
  urlState: UrlState
): [] | [DataSource] | [DataSource, string] {
  const { dataSource } = urlState;
  switch (dataSource) {
    case 'from-addon':
      return ['from-addon'];
    case 'from-file':
      return ['from-file'];
    case 'local':
      return ['local', urlState.hash];
    case 'public':
      return ['public', urlState.hash];
    case 'from-url':
      return ['from-url', encodeURIComponent(urlState.profileUrl)];
    case 'compare':
      return ['compare'];
    case 'none':
      return [];
    default:
      throw assertExhaustiveCheck(dataSource);
  }
}

// "null | void" in the query objects are flags which map to true for null, and false
// for void. False flags do not show up the URL.
type BaseQuery = {|
  v: number,
  range: string, //
  thread: string, // "3"
  globalTrackOrder: string, // "3-2-0-1"
  hiddenGlobalTracks: string, // "0-1"
  hiddenLocalTracksByPid: string,
  localTrackOrderByPid: string,
  file: string, // Path into a zip file.
  transforms: string,
  timelineType: string,
  // The following values are legacy, and will be converted to track-based values. These
  // value can't be upgraded using the typical URL upgrading process, as the full profile
  // must be fetched to compute the tracks.
  threadOrder: string, // "3-2-0-1"
  hiddenThreads: string, // "0-1"
  profiles: string[],
  profileName: string,
|};

type CallTreeQuery = {|
  ...BaseQuery,
  search: string, // "js::RunScript"
  invertCallstack: null | void,
  implementation: string,
  ctSummary: string,
|};

type MarkersQuery = {|
  ...BaseQuery,
  markerSearch: string, // "DOMEvent"
|};

type NetworkQuery = {|
  ...BaseQuery,
  networkSearch?: string, // "DOMEvent"
|};

type StackChartQuery = {|
  ...BaseQuery,
  search: string, // "js::RunScript"
  invertCallstack: null | void,
  showUserTimings: null | void,
  implementation: string,
  ctSummary: string,
|};

type JsTracerQuery = {|
  ...BaseQuery,
  summary: null | void,
|};

// Use object type spread in the definition of Query rather than unions, so that they
// are really easy to manipulate. This permissive definition makes it easy to not have
// to refine the type down to the individual query types when working with them.
type Query = {|
  ...CallTreeQuery,
  ...MarkersQuery,
  ...NetworkQuery,
  ...StackChartQuery,
  ...JsTracerQuery,
|};

type $MakeOptional = <T>(T) => T | void;
type QueryShape = $Shape<$ObjMap<Query, $MakeOptional>>;

type UrlObject = {|
  pathParts: string[],
  query: QueryShape,
|};

/**
 * Take the UrlState and map it into a serializable UrlObject, that represents the
 * target URL.
 */
export function urlStateToUrlObject(urlState: UrlState): UrlObject {
  const { dataSource } = urlState;
  if (dataSource === 'none') {
    return {
      pathParts: [],
      query: {},
    };
  }

  // Special handling for CompareHome: we shouldn't append the default
  // parameters when the user is on the comparison form.
  if (dataSource === 'compare' && urlState.profilesToCompare === null) {
    return {
      pathParts: ['compare'],
      query: {},
    };
  }

  const dataSourceDirs = getDataSourceDirs(urlState);
  const pathParts = [...dataSourceDirs, urlState.selectedTab];
  const { selectedThread } = urlState.profileSpecific;

  // Start with the query parameters that are shown regardless of the active tab.
  const query: QueryShape = {
    range:
      stringifyCommittedRanges(urlState.profileSpecific.committedRanges) ||
      undefined,
    thread: selectedThread === null ? undefined : selectedThread.toString(),
    globalTrackOrder:
      urlState.profileSpecific.globalTrackOrder.join('-') || undefined,
    file: urlState.pathInZipFile || undefined,
    profiles: urlState.profilesToCompare || undefined,
    v: CURRENT_URL_VERSION,
    profileName: urlState.profileName || undefined,
  };

  // Add the parameter hiddenGlobalTracks only when needed.
  if (urlState.profileSpecific.hiddenGlobalTracks.size > 0) {
    query.hiddenGlobalTracks = [
      ...urlState.profileSpecific.hiddenGlobalTracks,
    ].join('-');
  }

  let hiddenLocalTracksByPid = '';
  for (const [pid, tracks] of urlState.profileSpecific.hiddenLocalTracksByPid) {
    if (tracks.size > 0) {
      hiddenLocalTracksByPid += [pid, ...tracks].join('-') + '~';
    }
  }
  if (hiddenLocalTracksByPid.length > 0) {
    // Only add to the query string if something was actually hidden.
    // Also, slice off the last '~'.
    query.hiddenLocalTracksByPid = hiddenLocalTracksByPid.slice(0, -1);
  }

  if (urlState.profileSpecific.timelineType === 'stack') {
    // The default is the category view, so only add it to the URL if it's the
    // stack view.
    query.timelineType = 'stack';
  }

  let localTrackOrderByPid = '';
  for (const [pid, trackOrder] of urlState.profileSpecific
    .localTrackOrderByPid) {
    if (trackOrder.length > 0) {
      localTrackOrderByPid += `${String(pid)}-` + trackOrder.join('-') + '~';
    }
  }
  query.localTrackOrderByPid = localTrackOrderByPid || undefined;

  // Depending on which tab is active, also show tab-specific query parameters.
  const selectedTab = urlState.selectedTab;
  switch (selectedTab) {
    case 'stack-chart':
    case 'flame-graph':
    case 'calltree': {
      query.search = urlState.profileSpecific.callTreeSearchString || undefined;
      query.invertCallstack = urlState.profileSpecific.invertCallstack
        ? null
        : undefined;
      query.implementation =
        urlState.profileSpecific.implementation === 'combined'
          ? undefined
          : urlState.profileSpecific.implementation;
      if (selectedThread !== null) {
        query.transforms =
          stringifyTransforms(
            urlState.profileSpecific.transforms[selectedThread]
          ) || undefined;
      }
      query.ctSummary =
        urlState.profileSpecific.lastSelectedCallTreeSummaryStrategy ===
        'timing'
          ? undefined
          : urlState.profileSpecific.lastSelectedCallTreeSummaryStrategy;
      break;
    }
    case 'marker-table':
    case 'marker-chart':
      query.markerSearch =
        urlState.profileSpecific.markersSearchString || undefined;
      break;
    case 'network-chart':
      query.networkSearch =
        urlState.profileSpecific.networkSearchString || undefined;
      break;
    case 'js-tracer':
      // `null` adds the parameter to the query, while `undefined` doesn't.
      query.summary = urlState.profileSpecific.showJsTracerSummary
        ? null
        : undefined;
      break;
    default:
      assertExhaustiveCheck(selectedTab);
  }
  return { query, pathParts };
}

export function urlFromState(urlState: UrlState): string {
  const { pathParts, query } = urlStateToUrlObject(urlState);
  const { dataSource } = urlState;
  if (dataSource === 'none') {
    return '/';
  }
  const pathname =
    pathParts.length === 0 ? '/' : '/' + pathParts.join('/') + '/';

  const qString = queryString.stringify(query, {
    arrayFormat: 'bracket', // This uses parameters with brackets for arrays.
  });
  return pathname + (qString ? '?' + qString : '');
}

export function getDataSourceFromPathParts(pathParts: string[]): DataSource {
  const str = pathParts[0] || 'none';
  // With this switch, flow is able to understand that we return a valid value
  switch (str) {
    case 'none':
    case 'from-addon':
    case 'from-file':
    case 'local':
    case 'public':
    case 'from-url':
    case 'compare':
      return str;
    default:
      throw new Error(`Unexpected data source ${str}`);
  }
}

/**
 * Define only the properties of the window.location object that the function uses
 * so that it can be mocked in tests.
 */
type Location = {
  pathname: string,
  search: string,
  hash: string,
};

export function stateFromLocation(
  location: Location,
  profile?: Profile
): UrlState {
  const { pathname, query } = upgradeLocationToCurrentVersion(
    {
      pathname: location.pathname,
      hash: location.hash,
      query: queryString.parse(location.search.substr(1), {
        arrayFormat: 'bracket', // This uses parameters with brackets for arrays.
      }),
    },
    profile
  );

  const pathParts = pathname.split('/').filter(d => d);
  const dataSource = getDataSourceFromPathParts(pathParts);
  const selectedThread = query.thread !== undefined ? +query.thread : null;

  // https://profiler.firefox.com/public/{hash}/calltree/
  const hasProfileHash = ['local', 'public'].includes(dataSource);

  // https://profiler.firefox.com/from-url/{url}/calltree/
  const hasProfileUrl = ['from-url'].includes(dataSource);

  // The selected tab is the last path part in the URL.
  const selectedTabPathPart = hasProfileHash || hasProfileUrl ? 2 : 1;

  let implementation = 'combined';
  // Don't trust the implementation values from the user. Make sure it conforms
  // to known values.
  if (query.implementation === 'js' || query.implementation === 'cpp') {
    implementation = query.implementation;
  }

  const transforms = {};
  if (selectedThread !== null) {
    transforms[selectedThread] = query.transforms
      ? parseTransforms(query.transforms)
      : [];
  }

  return {
    dataSource,
    hash: hasProfileHash ? pathParts[1] : '',
    profileUrl: hasProfileUrl ? decodeURIComponent(pathParts[1]) : '',
    profilesToCompare: query.profiles || null,
    selectedTab: toValidTabSlug(pathParts[selectedTabPathPart]) || 'calltree',
    pathInZipFile: query.file || null,
    profileName: query.profileName,
    profileSpecific: {
      implementation,
      lastSelectedCallTreeSummaryStrategy: toValidCallTreeSummaryStrategy(
        query.ctSummary
      ),
      invertCallstack: query.invertCallstack !== undefined,
      showUserTimings: query.showUserTimings !== undefined,
      showJsTracerSummary: query.summary !== undefined,
      committedRanges: query.range ? parseCommittedRanges(query.range) : [],
      selectedThread: selectedThread,
      callTreeSearchString: query.search || '',
      globalTrackOrder: query.globalTrackOrder
        ? query.globalTrackOrder.split('-').map(index => Number(index))
        : [],
      hiddenGlobalTracks: query.hiddenGlobalTracks
        ? new Set(
            query.hiddenGlobalTracks.split('-').map(index => Number(index))
          )
        : new Set(),
      hiddenLocalTracksByPid: query.hiddenLocalTracksByPid
        ? parseHiddenTracks(query.hiddenLocalTracksByPid)
        : new Map(),
      localTrackOrderByPid: query.localTrackOrderByPid
        ? parseLocalTrackOrder(query.localTrackOrderByPid)
        : new Map(),
      markersSearchString: query.markerSearch || '',
      networkSearchString: query.networkSearch || '',
      transforms,
      timelineType: query.timelineType === 'stack' ? 'stack' : 'category',
      legacyThreadOrder: query.threadOrder
        ? query.threadOrder.split('-').map(index => Number(index))
        : null,
      legacyHiddenThreads: query.hiddenThreads
        ? query.hiddenThreads.split('-').map(index => Number(index))
        : null,
    },
  };
}

/**
 * Hidden tracks must have the track indexes plus the associated PID.
 *
 * Syntax: Pid-TrackIndex-TrackIndex~Pid-TrackIndex
 * Example: 124553-0-3~124554-1
 */
function parseHiddenTracks(rawText: string): Map<Pid, Set<TrackIndex>> {
  const hiddenLocalTracksByPid = new Map();

  for (const stringPart of rawText.split('~')) {
    const [pidString, ...indexStrings] = stringPart.split('-');
    if (indexStrings.length === 0) {
      continue;
    }
    const pid = Number(pidString);
    const indexes = indexStrings.map(string => Number(string));
    if (!isNaN(pid) && indexes.every(n => !isNaN(n))) {
      hiddenLocalTracksByPid.set(pid, new Set(indexes));
    }
  }
  return hiddenLocalTracksByPid;
}

/**
 * Local tracks must have their track order associated by PID.
 *
 * Syntax: Pid-TrackIndex-TrackIndex~Pid-TrackIndex
 * Example: 124553-0-3~124554-1
 */
function parseLocalTrackOrder(rawText: string): Map<Pid, TrackIndex[]> {
  const localTrackOrderByPid = new Map();

  for (const stringPart of rawText.split('~')) {
    const [pidString, ...indexStrings] = stringPart.split('-');
    if (indexStrings.length <= 1) {
      // There is no order to determine, let the URL validation create the
      // default value.
      continue;
    }
    const pid = Number(pidString);
    const indexes = indexStrings.map(string => Number(string));
    if (!isNaN(pid) && indexes.every(n => !isNaN(n))) {
      localTrackOrderByPid.set(pid, indexes);
    }
  }

  return localTrackOrderByPid;
}

type ProcessedLocation = {|
  pathname: string,
  hash: string,
  query: Query,
|};

type ProcessedLocationBeforeUpgrade = {|
  ...ProcessedLocation,
  query: Object,
|};

export function upgradeLocationToCurrentVersion(
  processedLocation: ProcessedLocationBeforeUpgrade,
  profile?: Profile
): ProcessedLocation {
  const urlVersion = +processedLocation.query.v || 0;
  if (urlVersion === CURRENT_URL_VERSION) {
    return processedLocation;
  }

  if (urlVersion > CURRENT_URL_VERSION) {
    throw new Error(
      `Unable to parse a url of version ${urlVersion}, most likely profiler.firefox.com needs to be refreshed. ` +
        `The most recent version understood by this version of profiler.firefox.com is version ${CURRENT_URL_VERSION}.\n` +
        'You can try refreshing this page in case profiler.firefox.com has updated in the meantime.'
    );
  }
  // Convert to CURRENT_URL_VERSION, one step at a time.
  for (
    let destVersion = urlVersion;
    destVersion <= CURRENT_URL_VERSION;
    destVersion++
  ) {
    if (destVersion in _upgraders) {
      _upgraders[destVersion](processedLocation, profile);
    }
  }

  processedLocation.query.v = CURRENT_URL_VERSION;
  return processedLocation;
}

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the processedLocation as its single argument and mutates it.
/* eslint-disable no-useless-computed-key */
const _upgraders = {
  [0]: (processedLocation: ProcessedLocationBeforeUpgrade, _: Profile) => {
    // Version 1 is the first versioned url.

    // If the pathname is '/', this could be a very old URL that has its information
    // stored in the hash.
    if (processedLocation.pathname === '/') {
      const legacyQuery = Object.assign(
        {},
        processedLocation.query,
        queryString.parse(processedLocation.hash)
      );
      if ('report' in legacyQuery) {
        // Put the report into the pathname.
        processedLocation.pathname = `/public/${legacyQuery.report}/calltree/`;
        processedLocation.hash = '';
        processedLocation.query = {};
      }
    }

    // Instead of implementation filters, we used to have jsOnly flags.
    if (processedLocation.query.jsOnly !== undefined) {
      // Support the old URL structure that had a jsOnly flag.
      delete processedLocation.query.jsOnly;
      processedLocation.query.implementation = 'js';
    }
  },
  [1]: (processedLocation: ProcessedLocationBeforeUpgrade, _: Profile) => {
    // The transform stack was added. Convert the callTreeFilters into the new
    // transforms format.
    if (processedLocation.query.callTreeFilters) {
      // Before: "callTreeFilters=prefix-0KV4KV5KV61KV7KV8K~postfixjs-xFFpUMl"
      // After: "transforms=f-combined-0KV4KV5KV61KV7KV8K~f-js-xFFpUMl-i"
      processedLocation.query.transforms = processedLocation.query.callTreeFilters
        .split('~')
        .map(s => {
          const [type, val] = s.split('-');
          switch (type) {
            case 'prefix':
              return `f-combined-${val}`;
            case 'prefixjs':
              return `f-js-${val}`;
            case 'postfix':
              return `f-combined-${val}-i`;
            case 'postfixjs':
              return `f-js-${val}-i`;
            default:
              return undefined;
          }
        })
        .filter(f => f)
        .join('~');
      delete processedLocation.query.callTreeFilters;
    }
  },
  [2]: (processedLocation: ProcessedLocationBeforeUpgrade, _: Profile) => {
    // Map the tab "timeline" to "stack-chart".
    // Map the tab "markers" to "marker-table".
    processedLocation.pathname = processedLocation.pathname
      // Given:    /public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/timeline/
      // Matches:  $1^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      .replace(/^(\/[^/]+\/[^/]+)\/timeline\/?/, '$1/stack-chart/')
      // Given:    /public/e71ce9584da34298627fb66ac7f2f245ba5edbf5/markers/
      // Matches:  $1^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      .replace(/^(\/[^/]+\/[^/]+)\/markers\/?/, '$1/marker-table/');
  },
  [3]: (processedLocation: ProcessedLocationBeforeUpgrade, _: Profile) => {
    const { query } = processedLocation;
    // Removed "Hide platform details" checkbox from the stack chart.
    if ('hidePlatformDetails' in query) {
      delete query.hidePlatformDetails;
      query.implementation = 'js';
    }
  },
  [4]: (
    processedLocation: ProcessedLocationBeforeUpgrade,
    profile: Profile
  ) => {
    // 'js' implementation filter has been changed to include 'relevantForJS' label frames.
    // Iterate through all transforms and upgrade the ones that has callNodePath with JS
    // implementation filter, so they also include 'relevantForJS' label frames in their
    // callNodePaths. For example,  in a call stack like this: 'C++->JS->relevantForJS->JS'
    // Previous callNodePath was 'JS,JS'. But now it has to be 'JS,relevantForJS,JS'.
    const query = processedLocation.query;
    const selectedThread = query.thread !== undefined ? +query.thread : null;
    const transforms = query.transforms
      ? parseTransforms(query.transforms)
      : [];

    if (transforms.length === 0) {
      // We don't have any transforms to upgrade.
      return;
    }

    if (selectedThread === null || profile === undefined) {
      return;
    }

    const thread = profile.threads[selectedThread];
    for (let i = 0; i < transforms.length; i++) {
      const transform = transforms[i];
      if (
        !transform.implementation ||
        transform.implementation !== 'js' ||
        !transform.callNodePath
      ) {
        // Only transforms with JS implementation filters that have callNodePaths
        // need to be upgraded.
        continue;
      }

      const callNodeStackIndex = getStackIndexFromVersion3JSCallNodePath(
        thread,
        transform.callNodePath
      );
      if (callNodeStackIndex === null) {
        // If we can't find the stack index of given call node path, just abort.
        continue;
      }
      transform.callNodePath = getVersion4JSCallNodePathFromStackIndex(
        thread,
        callNodeStackIndex
      );
    }
    processedLocation.query.transforms = stringifyTransforms(transforms);
  },
};

if (Object.keys(_upgraders).length - 1 !== CURRENT_URL_VERSION) {
  throw new Error(oneLine`
    CURRENT_URL_VERSION does not match the number of URL upgraders. If you added a
    new upgrader, make sure and bump the CURRENT_URL_VERSION variable.
  `);
}

// This function returns the stack index of the first occurrence of the given
// CallNodePath. Assumes the implementation filter of CallNodePath is 'js'.
// This should only be used for the URL upgrader, typically this
// operation would use a call node index rather than a stack.
function getStackIndexFromVersion3JSCallNodePath(
  thread: Thread,
  oldCallNodePath: CallNodePath
): IndexIntoStackTable | null {
  const { stackTable, funcTable, frameTable } = thread;
  const stackIndexDepth: Map<IndexIntoStackTable | null, number> = new Map();
  stackIndexDepth.set(null, -1);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const isJS = funcTable.isJS[funcIndex];
    // We know that at this point stack table is sorted and the following
    // condition holds:
    // assert(prefixStack === null || prefixStack < stackIndex);
    const doesPrefixMatchCallNodePath =
      prefix === null || stackIndexDepth.has(prefix);

    if (!doesPrefixMatchCallNodePath) {
      continue;
    }
    const prefixStackDepth = ensureExists(
      stackIndexDepth.get(prefix),
      'Unable to find the stack depth for a prefix'
    );
    const depth = prefixStackDepth + 1;

    if (isJS && oldCallNodePath[depth] === funcIndex) {
      // This is a JS frame, and it matches the CallNodePath.
      if (depth === oldCallNodePath.length - 1) {
        // This is the stack index that we are looking for.
        return stackIndex;
      }
      stackIndexDepth.set(stackIndex, depth);
    } else {
      // Any non-JS stack potentially matches, because they're skipped in the JS
      // call node path. Add it here using the previous depth.
      stackIndexDepth.set(stackIndex, prefixStackDepth);
    }
  }
  return null;
}

// Constructs the new JS CallNodePath from given stackIndex and returns it.
// This should only be used for the URL upgrader.
function getVersion4JSCallNodePathFromStackIndex(
  thread: Thread,
  stackIndex: IndexIntoStackTable
): CallNodePath {
  const { funcTable, stackTable, frameTable } = thread;
  const callNodePath = [];
  let nextStackIndex = stackIndex;
  while (nextStackIndex !== null) {
    const frameIndex = stackTable.frame[nextStackIndex];
    const funcIndex = frameTable.func[frameIndex];
    if (funcTable.isJS[funcIndex] || funcTable.relevantForJS[funcIndex]) {
      callNodePath.unshift(funcIndex);
    }
    nextStackIndex = stackTable.prefix[nextStackIndex];
  }
  return callNodePath;
}
