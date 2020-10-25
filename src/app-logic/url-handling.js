/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import queryString from 'query-string';
import {
  stringifyCommittedRanges,
  stringifyStartEnd,
  parseCommittedRanges,
} from 'firefox-profiler/profile-logic/committed-ranges';
import {
  stringifyTransforms,
  parseTransforms,
} from 'firefox-profiler/profile-logic/transforms';
import {
  assertExhaustiveCheck,
  toValidTabSlug,
  ensureExists,
} from 'firefox-profiler/utils/flow';
import { toValidCallTreeSummaryStrategy } from 'firefox-profiler/profile-logic/profile-data';
import { oneLine } from 'common-tags';
import type {
  UrlState,
  TimelineTrackOrganization,
  DataSource,
  Pid,
  Profile,
  Thread,
  IndexIntoStackTable,
  BrowsingContextID,
  TrackIndex,
  CallNodePath,
  ThreadIndex,
  TransformStacksPerThread,
} from 'firefox-profiler/types';

export const CURRENT_URL_VERSION = 5;

/**
 * This static piece of state might look like an anti-pattern, but it's a relatively
 * simple way to adjust whether we are pushing or replacing onto the history API.
 * The history API is a singleton, and so here we're also using a singleton pattern
 * to manage this bit of state.
 */
let _isReplaceState: boolean = false;
let _replaceHistoryCallCount: number = 0;

function _enableHistoryReplaceState(): void {
  _replaceHistoryCallCount++;
  _isReplaceState = true;
}

/**
 * Only disable the replace state if the call count is 0.
 */
function _maybeDisableHistoryReplaceState(): void {
  _replaceHistoryCallCount--;
  if (_replaceHistoryCallCount < 0) {
    throw new Error(
      '_maybeDisableHistoryReplaceState was called more than _enableHistoryReplaceState which should never happen.'
    );
  }
  if (_replaceHistoryCallCount === 0) {
    _isReplaceState = false;
  }
}

/**
 * This function changes the behavior of the history API to replace the current state,
 * rather than pushState. It applies the function synchronously.
 */
export function withHistoryReplaceStateSync(fn: () => void): void {
  _enableHistoryReplaceState();
  fn();
  _maybeDisableHistoryReplaceState();
}

/**
 * The asynchronous variant of `withHistoryReplaceStateSync`.
 */
export async function withHistoryReplaceStateAsync(
  fn: () => Promise<void>
): Promise<void> {
  _enableHistoryReplaceState();
  await fn();
  _maybeDisableHistoryReplaceState();
}

/**
 * This function is consumed by the UrlManager so it knows how to interact with the
 * history API. It's embedded here to avoid cyclical dependencies when importing files.
 */
export function getIsHistoryReplaceState(): boolean {
  return _isReplaceState;
}

function getPathParts(urlState: UrlState): string[] {
  const { dataSource } = urlState;
  switch (dataSource) {
    case 'none':
      return [];
    case 'compare':
      return ['compare'];
    case 'uploaded-recordings':
      return ['uploaded-recordings'];
    case 'from-addon':
      return ['from-addon', urlState.selectedTab];
    case 'from-file':
      return ['from-file', urlState.selectedTab];
    case 'local':
      return ['local', urlState.hash, urlState.selectedTab];
    case 'public':
      return ['public', urlState.hash, urlState.selectedTab];
    case 'from-url':
      return [
        'from-url',
        encodeURIComponent(urlState.profileUrl),
        urlState.selectedTab,
      ];
    default:
      throw assertExhaustiveCheck(dataSource);
  }
}

// Base query that only applies to full profile view.
type FullProfileSpecificBaseQuery = {|
  globalTrackOrder: string, // "3-2-0-1"
  hiddenGlobalTracks: string, // "0-1"
  hiddenLocalTracksByPid: string,
  localTrackOrderByPid: string,
  timelineType: string,
  // The following values are legacy, and will be converted to track-based values. These
  // value can't be upgraded using the typical URL upgrading process, as the full profile
  // must be fetched to compute the tracks.
  threadOrder: string, // "3-2-0-1"
  hiddenThreads: string, // "0-1"
|};

// Base query that only applies to active tab profile view.
type ActiveTabProfileSpecificBaseQuery = {|
  resources: null | void,
  ctxId: BrowsingContextID | void,
|};

// Base query that only applies to origins profile view.
type OriginsProfileSpecificBaseQuery = {||};

// "null | void" in the query objects are flags which map to true for null, and false
// for void. False flags do not show up the URL.
type BaseQuery = {|
  v: number,
  range: string, //
  thread: string, // "3"
  file: string, // Path into a zip file.
  transforms: string,
  profiles: string[],
  profileName: string,
  view: string,
  ...FullProfileSpecificBaseQuery,
  ...ActiveTabProfileSpecificBaseQuery,
  ...OriginsProfileSpecificBaseQuery,
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

type Query =
  | CallTreeQuery
  | MarkersQuery
  | NetworkQuery
  | StackChartQuery
  | JsTracerQuery;

type $MakeOptional = <T>(T) => T | void;
// Base query shape is needed for the typechecking during the URL query initialization.
type BaseQueryShape = $Shape<$ObjMap<BaseQuery, $MakeOptional>>;
// Full profile view and active tab profile view query shapes are for also
// typechecking during the query object initialization.
type FullProfileSpecificBaseQueryShape = $Shape<
  $ObjMap<FullProfileSpecificBaseQuery, $MakeOptional>
>;
type ActiveTabProfileSpecificBaseQueryShape = $Shape<
  $ObjMap<ActiveTabProfileSpecificBaseQuery, $MakeOptional>
>;
type OriginsProfileSpecificBaseQueryShape = $Shape<
  $ObjMap<OriginsProfileSpecificBaseQuery, $MakeOptional>
>;

// Query shapes for individual query paths. These are needed for QueryShape union type.
type CallTreeQueryShape = $Shape<$ObjMap<CallTreeQuery, $MakeOptional>>;
type MarkersQueryShape = $Shape<$ObjMap<MarkersQuery, $MakeOptional>>;
type NetworkQueryShape = $Shape<$ObjMap<NetworkQuery, $MakeOptional>>;
type StackChartQueryShape = $Shape<$ObjMap<StackChartQuery, $MakeOptional>>;
type JsTracerQueryShape = $Shape<$ObjMap<JsTracerQuery, $MakeOptional>>;

type QueryShape =
  | CallTreeQueryShape
  | MarkersQueryShape
  | NetworkQueryShape
  | StackChartQueryShape
  | JsTracerQueryShape;

/**
 * Take the UrlState and map it into a query string.
 */
export function getQueryStringFromUrlState(urlState: UrlState): string {
  const { dataSource } = urlState;
  switch (dataSource) {
    case 'none':
    case 'uploaded-recordings':
      return '';
    case 'compare':
      // Special handling for CompareHome: we shouldn't append the default
      // parameters when the user is on the comparison form.
      if (urlState.profilesToCompare === null) {
        return '';
      }
      break;
    case 'public':
    case 'local':
    case 'from-addon':
    case 'from-file':
    case 'from-url':
      break;
    default:
      throw assertExhaustiveCheck(dataSource);
  }

  const { selectedThreads } = urlState.profileSpecific;

  let ctxId;
  let view;
  const { timelineTrackOrganization } = urlState;
  switch (timelineTrackOrganization.type) {
    case 'full':
      // Dont URL-encode anything.
      break;
    case 'active-tab':
      view = timelineTrackOrganization.type;
      ctxId = timelineTrackOrganization.browsingContextID;
      break;
    case 'origins':
      view = timelineTrackOrganization.type;
      break;
    default:
      throw assertExhaustiveCheck(
        timelineTrackOrganization,
        'Unhandled TimelineTrackOrganization case'
      );
  }

  // Start with the query parameters that are shown regardless of the active panel.
  let baseQuery;
  switch (timelineTrackOrganization.type) {
    case 'full': {
      // Add the full profile specific state query here.
      baseQuery = ({}: FullProfileSpecificBaseQueryShape);
      baseQuery.globalTrackOrder =
        urlState.profileSpecific.full.globalTrackOrder.join('-') || undefined;

      // Add the parameter hiddenGlobalTracks only when needed.
      if (urlState.profileSpecific.full.hiddenGlobalTracks.size > 0) {
        baseQuery.hiddenGlobalTracks = [
          ...urlState.profileSpecific.full.hiddenGlobalTracks,
        ].join('-');
      }

      let hiddenLocalTracksByPid = '';
      for (const [pid, tracks] of urlState.profileSpecific.full
        .hiddenLocalTracksByPid) {
        if (tracks.size > 0) {
          hiddenLocalTracksByPid += [pid, ...tracks].join('-') + '~';
        }
      }
      if (hiddenLocalTracksByPid.length > 0) {
        // Only add to the query string if something was actually hidden.
        // Also, slice off the last '~'.
        baseQuery.hiddenLocalTracksByPid = hiddenLocalTracksByPid.slice(0, -1);
      }

      if (urlState.profileSpecific.full.timelineType === 'stack') {
        // The default is the category view, so only add it to the URL if it's the
        // stack view.
        baseQuery.timelineType = 'stack';
      }

      let localTrackOrderByPid = '';
      for (const [pid, trackOrder] of urlState.profileSpecific.full
        .localTrackOrderByPid) {
        if (trackOrder.length > 0) {
          localTrackOrderByPid +=
            `${String(pid)}-` + trackOrder.join('-') + '~';
        }
      }
      baseQuery.localTrackOrderByPid = localTrackOrderByPid || undefined;
      break;
    }
    case 'active-tab': {
      baseQuery = ({}: ActiveTabProfileSpecificBaseQueryShape);

      baseQuery.resources = urlState.profileSpecific.activeTab
        .isResourcesPanelOpen
        ? null
        : undefined;
      baseQuery.ctxId = ctxId || undefined;
      break;
    }
    case 'origins':
      baseQuery = ({}: OriginsProfileSpecificBaseQueryShape);
      break;
    default:
      throw assertExhaustiveCheck(
        timelineTrackOrganization,
        `Unhandled GlobalTrack type.`
      );
  }

  baseQuery = ({
    ...baseQuery,
    range:
      stringifyCommittedRanges(urlState.profileSpecific.committedRanges) ||
      undefined,
    thread:
      selectedThreads === null ? undefined : [...selectedThreads].join(','),
    file: urlState.pathInZipFile || undefined,
    profiles: urlState.profilesToCompare || undefined,
    view,
    v: CURRENT_URL_VERSION,
    profileName: urlState.profileName || undefined,
  }: BaseQueryShape);

  // Depending on which panel is active, also show tab-specific query parameters.
  let query: QueryShape;
  const selectedTab = urlState.selectedTab;
  switch (selectedTab) {
    case 'stack-chart':
    case 'flame-graph':
    case 'calltree': {
      if (selectedTab === 'stack-chart') {
        // Stack chart uses all of the CallTree's query strings but also has an
        // additional query string.
        query = (baseQuery: StackChartQueryShape);
        query.showUserTimings = urlState.profileSpecific.showUserTimings
          ? null
          : undefined;
      } else {
        query = (baseQuery: CallTreeQueryShape);
      }

      query.search = urlState.profileSpecific.callTreeSearchString || undefined;
      query.invertCallstack = urlState.profileSpecific.invertCallstack
        ? null
        : undefined;
      query.implementation =
        urlState.profileSpecific.implementation === 'combined'
          ? undefined
          : urlState.profileSpecific.implementation;
      if (selectedThreads !== null) {
        query.transforms =
          stringifyTransforms(
            selectedThreads,
            urlState.profileSpecific.transforms
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
      query = (baseQuery: MarkersQueryShape);
      query.markerSearch =
        urlState.profileSpecific.markersSearchString || undefined;
      break;
    case 'network-chart':
      query = (baseQuery: NetworkQueryShape);
      query.networkSearch =
        urlState.profileSpecific.networkSearchString || undefined;
      break;
    case 'js-tracer': {
      query = (baseQuery: JsTracerQueryShape);
      const { timelineTrackOrganization } = urlState;
      switch (timelineTrackOrganization.type) {
        case 'full':
        case 'origins':
          // `null` adds the parameter to the query, while `undefined` doesn't.
          query.summary = urlState.profileSpecific.full.showJsTracerSummary
            ? null
            : undefined;
          break;
        case 'active-tab':
          // JS Tracer isn't helpful for web developers.
          break;
        default:
          throw assertExhaustiveCheck(
            timelineTrackOrganization,
            'Unhandled timelineTrackOrganization case'
          );
      }
      break;
    }
    default:
      throw assertExhaustiveCheck(selectedTab);
  }

  const qString = queryString.stringify(query, {
    arrayFormat: 'bracket', // This uses parameters with brackets for arrays.
  });
  return qString;
}

export function urlFromState(urlState: UrlState): string {
  const pathParts = getPathParts(urlState);
  const qString = getQueryStringFromUrlState(urlState);
  const { dataSource } = urlState;
  if (dataSource === 'none') {
    return '/';
  }
  const pathname =
    pathParts.length === 0 ? '/' : '/' + pathParts.join('/') + '/';

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
    case 'uploaded-recordings':
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
  const selectedThreadsList: ThreadIndex[] =
    // Either a single thread index, or a list separated by commas.
    query.thread !== undefined ? query.thread.split(',').map(n => +n) : [];

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

  const transforms = parseTransforms(selectedThreadsList, query.transforms);

  let browsingContextId = null;
  if (query.ctxId && Number.isInteger(Number(query.ctxId))) {
    browsingContextId = Number(query.ctxId);
  }

  return {
    dataSource,
    hash: hasProfileHash ? pathParts[1] : '',
    profileUrl: hasProfileUrl ? decodeURIComponent(pathParts[1]) : '',
    profilesToCompare: query.profiles || null,
    selectedTab: toValidTabSlug(pathParts[selectedTabPathPart]) || 'calltree',
    pathInZipFile: query.file || null,
    profileName: query.profileName,
    timelineTrackOrganization: validateTimelineTrackOrganization(
      query.view,
      browsingContextId
    ),
    profileSpecific: {
      implementation,
      lastSelectedCallTreeSummaryStrategy: toValidCallTreeSummaryStrategy(
        query.ctSummary || undefined
      ),
      invertCallstack: query.invertCallstack === undefined ? false : true,
      showUserTimings: query.showUserTimings === undefined ? false : true,
      committedRanges: query.range ? parseCommittedRanges(query.range) : [],
      selectedThreads:
        selectedThreadsList.length === 0 ? null : new Set(selectedThreadsList),
      callTreeSearchString: query.search || '',
      markersSearchString: query.markerSearch || '',
      networkSearchString: query.networkSearch || '',
      transforms,
      full: {
        showJsTracerSummary: query.summary === undefined ? false : true,
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
        timelineType: query.timelineType === 'stack' ? 'stack' : 'category',
        legacyThreadOrder: query.threadOrder
          ? query.threadOrder.split('-').map(index => Number(index))
          : null,
        legacyHiddenThreads: query.hiddenThreads
          ? query.hiddenThreads.split('-').map(index => Number(index))
          : null,
      },
      activeTab: {
        isResourcesPanelOpen: query.resources !== undefined,
      },
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

// This Error class is used in other codepaths to detect the specific error of
// URL upgrading and react differently when this happens, compared to other
// errors.
// Exported for tests.
export class UrlUpgradeError extends Error {
  name = 'UrlUpgradeError';
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
    throw new UrlUpgradeError(
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
    const selectedThread: null | number =
      query.thread === undefined ? null : +query.thread;

    if (selectedThread === null || profile === undefined) {
      return;
    }

    const transformStacksPerThread: TransformStacksPerThread = query.transforms
      ? parseTransforms([selectedThread], query.transforms)
      : {};

    // At the time this upgrader was written, there was only one selected thread.
    // Only upgrade the single transfrom.
    const transforms = transformStacksPerThread[selectedThread];

    if (!transforms || transforms.length === 0) {
      // We don't have any transforms to upgrade.
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
      // This property is not writable, make it an "any"
      (transform: any).callNodePath = getVersion4JSCallNodePathFromStackIndex(
        thread,
        callNodeStackIndex
      );
    }

    processedLocation.query.transforms = stringifyTransforms(
      new Set([selectedThread]),
      transformStacksPerThread
    );
  },
  [5]: ({ query }: ProcessedLocationBeforeUpgrade) => {
    // We changed how the ranges are serialized to the URLs. Before it was the
    // pair of start/end in seconds unit with 4 digits, now this is a pair of
    // start/duration, where start and duration are both integers expressed with
    // a specific unit.
    // For example we'll convert from 1.2345_2.3456 (that is: a range starting
    // at 1.2345s and ending at 2.3456s) to 1234m1112 (a range starting at
    // 1234ms and ending after 1112ms). You notice that the range is slightly
    // bigger, because this accounts for the loss of precision.
    if (!query.range) {
      return;
    }

    query.range = query.range
      .split('~')
      .map(committedRange => {
        // This regexp captures two (positive or negative) numbers, separated by a `_`.
        const m = committedRange.match(/^(-?[0-9.]+)_(-?[0-9.]+)$/);
        if (!m) {
          console.error(
            `The range "${committedRange}" couldn't be parsed, ignoring.`
          );
          return null;
        }
        const start = Number(m[1]) * 1000;
        const end = Number(m[2]) * 1000;
        if (isNaN(start) || isNaN(end)) {
          console.error(
            `The range "${committedRange}" couldn't be parsed, ignoring.`
          );
          return null;
        }

        return stringifyStartEnd({ start, end });
      })
      .filter(Boolean)
      .join('~');
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

function validateTimelineTrackOrganization(
  type: ?string,
  browsingContextID: number | null
): TimelineTrackOrganization {
  // Pretend this is a TimelineTrackOrganization so that we can exhaustively
  // go through each option.
  const timelineTrackOrganization: TimelineTrackOrganization = ({ type }: any);
  switch (timelineTrackOrganization.type) {
    case 'full':
      return { type: 'full' };
    case 'active-tab':
      return { type: 'active-tab', browsingContextID };
    case 'origins':
      return { type: 'origins' };
    default:
      // Type assert we've checked everythign:
      (timelineTrackOrganization: empty);

      return { type: 'full' };
  }
}
