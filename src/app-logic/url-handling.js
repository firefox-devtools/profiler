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
  coerce,
  ensureExists,
} from 'firefox-profiler/utils/flow';
import {
  getThreadsKey,
  toValidCallTreeSummaryStrategy,
} from 'firefox-profiler/profile-logic/profile-data';
import { oneLine } from 'common-tags';
import type {
  UrlState,
  TimelineTrackOrganization,
  DataSource,
  Pid,
  Profile,
  Thread,
  IndexIntoStackTable,
  TabID,
  TrackIndex,
  CallNodePath,
  ThreadIndex,
  TimelineType,
  SourceViewState,
} from 'firefox-profiler/types';
import {
  decodeUintArrayFromUrlComponent,
  encodeUintArrayForUrlComponent,
  encodeUintSetForUrlComponent,
} from '../utils/uintarray-encoding';
import { tabSlugs } from '../app-logic/tabs-handling';

export const CURRENT_URL_VERSION = 6;

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
  try {
    fn();
  } finally {
    _maybeDisableHistoryReplaceState();
  }
}

/**
 * The asynchronous variant of `withHistoryReplaceStateSync`.
 */
export async function withHistoryReplaceStateAsync(
  fn: () => Promise<void>
): Promise<void> {
  _enableHistoryReplaceState();
  try {
    await fn();
  } finally {
    _maybeDisableHistoryReplaceState();
  }
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
      // Special handling for CompareHome: we shouldn't append anything but the
      // dataSource when the user is on the comparison form.
      if (urlState.profilesToCompare === null) {
        return ['compare'];
      }
      return ['compare', urlState.selectedTab];
    case 'uploaded-recordings':
      return ['uploaded-recordings'];
    case 'from-browser':
    case 'unpublished':
    case 'from-file':
      return [dataSource, urlState.selectedTab];
    case 'public':
    case 'local':
      return [dataSource, urlState.hash, urlState.selectedTab];
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
  globalTrackOrder: string, // "3201"
  hiddenGlobalTracks: string, // "01"
  hiddenLocalTracksByPid: string, // "1549-0w8~1593-23~1598-01~1602-02~1607-1"
  localTrackOrderByPid: string, // "1549-780w6~1560-01"
  // The following values are legacy, and will be converted to track-based values. These
  // value can't be upgraded using the typical URL upgrading process, as the full profile
  // must be fetched to compute the tracks.
  threadOrder: string, // "3-2-0-1"
  hiddenThreads: string, // "0-1"
|};

// Base query that only applies to active tab profile view.
type ActiveTabProfileSpecificBaseQuery = {|
  resources: null | void,
  ctxId: TabID | void,
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
  symbolServer: string,
  view: string,
  implementation: string,
  timelineType: string,
  sourceView: string,
  ...FullProfileSpecificBaseQuery,
  ...ActiveTabProfileSpecificBaseQuery,
  ...OriginsProfileSpecificBaseQuery,
|};

type CallTreeQuery = {|
  ...BaseQuery,
  search: string, // "js::RunScript"
  invertCallstack: null | void,
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
    case 'from-browser':
    case 'unpublished':
    case 'from-file':
    case 'from-url':
      break;
    default:
      throw assertExhaustiveCheck(dataSource);
  }

  const { selectedThreads } = urlState.profileSpecific;
  const selectedThreadsKey =
    selectedThreads !== null ? getThreadsKey(selectedThreads) : null;

  let ctxId;
  let view;
  const { timelineTrackOrganization } = urlState;
  switch (timelineTrackOrganization.type) {
    case 'full':
      // Dont URL-encode anything.
      break;
    case 'active-tab':
      view = timelineTrackOrganization.type;
      ctxId = timelineTrackOrganization.tabID;
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
      baseQuery.globalTrackOrder = convertGlobalTrackOrderToString(
        urlState.profileSpecific.full.globalTrackOrder
      );
      baseQuery.hiddenGlobalTracks = convertHiddenGlobalTracksToString(
        urlState.profileSpecific.full.hiddenGlobalTracks
      );
      baseQuery.hiddenLocalTracksByPid = convertHiddenLocalTracksByPidToString(
        urlState.profileSpecific.full.hiddenLocalTracksByPid
      );
      baseQuery.localTrackOrderByPid = convertLocalTrackOrderByPidToString(
        urlState.profileSpecific.full.localTrackOrderByPid
      );

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
      selectedThreads === null
        ? undefined
        : encodeUintSetForUrlComponent(selectedThreads),
    file: urlState.pathInZipFile || undefined,
    profiles: urlState.profilesToCompare || undefined,
    view,
    v: CURRENT_URL_VERSION,
    profileName: urlState.profileName || undefined,
    symbolServer: urlState.symbolServerUrl || undefined,
    implementation:
      urlState.profileSpecific.implementation === 'combined'
        ? undefined
        : urlState.profileSpecific.implementation,
    timelineType:
      // The default is the category view, so only add it to the URL if it's the
      // stack or cpu-category view.
      // TODO: We should make the 'cpu-category' the new default with an upgrader.
      urlState.profileSpecific.timelineType === 'category'
        ? undefined
        : urlState.profileSpecific.timelineType,
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
      if (
        selectedThreadsKey !== null &&
        urlState.profileSpecific.transforms[selectedThreadsKey]
      ) {
        query.transforms =
          stringifyTransforms(
            urlState.profileSpecific.transforms[selectedThreadsKey]
          ) || undefined;
      }
      query.ctSummary =
        urlState.profileSpecific.lastSelectedCallTreeSummaryStrategy ===
        'timing'
          ? undefined
          : urlState.profileSpecific.lastSelectedCallTreeSummaryStrategy;
      const { sourceView, isBottomBoxOpenPerPanel } = urlState.profileSpecific;
      query.sourceView =
        sourceView.file !== null && isBottomBoxOpenPerPanel[selectedTab]
          ? sourceView.file
          : undefined;
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

export function ensureIsValidDataSource(
  possibleDataSource: string | void
): DataSource {
  // By casting `possibleDataSource` to a DataSource beforehand, we let Flow
  // enforce that we look at all possible values.
  const coercedDataSource = coerce<string, DataSource>(
    possibleDataSource || 'none'
  );
  switch (coercedDataSource) {
    case 'none':
    case 'from-browser':
    case 'unpublished':
    case 'from-file':
    case 'local':
    case 'public':
    case 'from-url':
    case 'compare':
    case 'uploaded-recordings':
      return coercedDataSource;
    default:
      throw assertExhaustiveCheck(
        coercedDataSource,
        `Unexpected data source ${coercedDataSource}`
      );
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

/**
 * Parse the window.location string to create the UrlState.
 *
 * `profile` parameter is nullable and optional. It's nullable because data sources
 * like from-browser can't upgrade a url for a freshly captured profile. So we need
 * to skip upgrading for these sources. It's also optional for both testing
 * purposes and for places where we would like to do the upgrading without
 * providing any profile.
 */
export function stateFromLocation(
  location: Location,
  profile?: Profile | null
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

  const pathParts = pathname.split('/').filter((d) => d);
  const dataSource = ensureIsValidDataSource(pathParts[0]);
  const selectedThreadsList: ThreadIndex[] =
    // Either a single thread index, or a list separated by commas.
    query.thread !== undefined
      ? decodeUintArrayFromUrlComponent(query.thread)
      : [];

  const selectedThreads =
    selectedThreadsList.length !== 0 ? new Set(selectedThreadsList) : null;
  const selectedThreadsKey =
    selectedThreads !== null ? getThreadsKey(selectedThreads) : null;

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
  if (selectedThreadsKey !== null) {
    transforms[selectedThreadsKey] = parseTransforms(query.transforms);
  }

  let tabID = null;
  if (query.ctxId && Number.isInteger(Number(query.ctxId))) {
    tabID = Number(query.ctxId);
  }

  const selectedTab =
    toValidTabSlug(pathParts[selectedTabPathPart]) || 'calltree';
  const sourceView: SourceViewState = {
    activationGeneration: 0,
    file: null,
  };
  const isBottomBoxOpenPerPanel = {};
  tabSlugs.forEach((tabSlug) => (isBottomBoxOpenPerPanel[tabSlug] = false));
  if (query.sourceView) {
    sourceView.file = query.sourceView;
    isBottomBoxOpenPerPanel[selectedTab] = true;
  }

  return {
    dataSource,
    hash: hasProfileHash ? pathParts[1] : '',
    profileUrl: hasProfileUrl ? decodeURIComponent(pathParts[1]) : '',
    profilesToCompare: query.profiles || null,
    selectedTab,
    pathInZipFile: query.file || null,
    profileName: query.profileName,
    symbolServerUrl: query.symbolServer || null,
    timelineTrackOrganization: validateTimelineTrackOrganization(
      query.view,
      tabID
    ),
    profileSpecific: {
      implementation,
      lastSelectedCallTreeSummaryStrategy: toValidCallTreeSummaryStrategy(
        query.ctSummary || undefined
      ),
      invertCallstack: query.invertCallstack === undefined ? false : true,
      showUserTimings: query.showUserTimings === undefined ? false : true,
      committedRanges: query.range ? parseCommittedRanges(query.range) : [],
      selectedThreads,
      callTreeSearchString: query.search || '',
      markersSearchString: query.markerSearch || '',
      networkSearchString: query.networkSearch || '',
      transforms,
      sourceView,
      isBottomBoxOpenPerPanel,
      timelineType: validateTimelineType(query.timelineType),
      full: {
        showJsTracerSummary: query.summary === undefined ? false : true,
        globalTrackOrder: convertGlobalTrackOrderFromString(
          query.globalTrackOrder
        ),
        hiddenGlobalTracks: convertHiddenGlobalTracksFromString(
          query.hiddenGlobalTracks
        ),
        hiddenLocalTracksByPid: convertHiddenLocalTracksByPidFromString(
          query.hiddenLocalTracksByPid
        ),
        localTrackOrderByPid: convertLocalTrackOrderByPidFromString(
          query.localTrackOrderByPid
        ),
        legacyThreadOrder: query.threadOrder
          ? query.threadOrder.split('-').map((index) => Number(index))
          : null,
        legacyHiddenThreads: query.hiddenThreads
          ? query.hiddenThreads.split('-').map((index) => Number(index))
          : null,
      },
      activeTab: {
        isResourcesPanelOpen: query.resources !== undefined,
      },
    },
  };
}

function convertGlobalTrackOrderFromString(
  rawString: string | null | void
): TrackIndex[] {
  if (!rawString) {
    return [];
  }

  return decodeUintArrayFromUrlComponent(rawString);
}

function convertGlobalTrackOrderToString(order: TrackIndex[]): string | void {
  return encodeUintArrayForUrlComponent(order) || undefined;
}

function convertHiddenGlobalTracksFromString(
  rawString: string | null | void
): Set<TrackIndex> {
  if (!rawString) {
    return new Set();
  }

  return new Set(decodeUintArrayFromUrlComponent(rawString));
}

function convertHiddenGlobalTracksToString(
  hiddenGlobalTracks: Set<TrackIndex>
): string | void {
  // Add the parameter hiddenGlobalTracks only when needed.
  if (hiddenGlobalTracks.size > 0) {
    return encodeUintSetForUrlComponent(hiddenGlobalTracks);
  }
  return undefined;
}

/**
 * Hidden local tracks must have the track indexes plus the associated PID.
 *
 * Syntax: Pid-<encoded TrackIndex set>~Pid-<encoded TrackIndex set>
 * Example: 124553-03~124554-1
 */
function convertHiddenLocalTracksByPidFromString(
  rawText: string | null | void
): Map<Pid, Set<TrackIndex>> {
  if (!rawText) {
    return new Map();
  }

  const hiddenLocalTracksByPid = new Map();

  for (const stringPart of rawText.split('~')) {
    if (!stringPart.includes('-')) {
      continue;
    }
    const pidString = stringPart.slice(0, stringPart.indexOf('-'));
    const hiddenTracksString = stringPart.slice(pidString.length + 1);
    const pid = Number(pidString);
    const indexes = decodeUintArrayFromUrlComponent(hiddenTracksString);
    if (!isNaN(pid) && indexes.every((n) => !isNaN(n))) {
      hiddenLocalTracksByPid.set(pid, new Set(indexes));
    }
  }
  return hiddenLocalTracksByPid;
}

function convertHiddenLocalTracksByPidToString(
  hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>
): string | void {
  const strings = [];
  for (const [pid, tracks] of hiddenLocalTracksByPid) {
    if (tracks.size > 0) {
      strings.push(`${pid}-${encodeUintSetForUrlComponent(tracks)}`);
    }
  }
  // Only add to the query string if something was actually hidden.
  return strings.join('~') || undefined;
}

/**
 * Local tracks must have their track order associated by PID.
 *
 * Syntax: Pid-<encoded TrackIndex array>~Pid-<encoded TrackIndex array>
 * Example: 124553-0w354~124554-1
 */
function convertLocalTrackOrderByPidFromString(
  rawText: string | null | void
): Map<Pid, TrackIndex[]> {
  if (!rawText) {
    return new Map();
  }

  const localTrackOrderByPid = new Map();

  for (const stringPart of rawText.split('~')) {
    if (!stringPart.includes('-')) {
      // There is no order to determine, let the URL validation create the
      // default value.
      continue;
    }
    const pidString = stringPart.slice(0, stringPart.indexOf('-'));
    const trackOrderString = stringPart.slice(pidString.length + 1);
    const pid = Number(pidString);
    const indexes = decodeUintArrayFromUrlComponent(trackOrderString);
    if (!isNaN(pid) && indexes.every((n) => !isNaN(n))) {
      localTrackOrderByPid.set(pid, indexes);
    }
  }

  return localTrackOrderByPid;
}

function convertLocalTrackOrderByPidToString(
  localTrackOrderByPid: Map<Pid, TrackIndex[]>
): string | void {
  const strings = [];
  for (const [pid, trackOrder] of localTrackOrderByPid) {
    if (trackOrder.length > 0) {
      strings.push(
        `${String(pid)}-${encodeUintArrayForUrlComponent(trackOrder)}`
      );
    }
  }
  return strings.join('~') || undefined;
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
  query: any,
|};

// URL upgrading is skipped if the profile argument is null.
// URL upgrading is performed if the profile argument is missing (undefined) or if it's an actual profile.
export function upgradeLocationToCurrentVersion(
  processedLocation: ProcessedLocationBeforeUpgrade,
  profile?: Profile | null
): ProcessedLocation {
  // Forward /from-addon to /from-browser immediately, outside of the versioning process.
  // This ensures compatibility with Firefox versions < 93.
  // It's possible we get 2 '/' characters if the user changes their base-url
  // preference in about:config, so we should handle this case so that we don't
  // get errors later in the loading process.
  processedLocation.pathname = processedLocation.pathname.replace(
    /^\/+from-addon/,
    '/from-browser'
  );

  const urlVersion = +processedLocation.query.v || 0;
  if (profile === null || urlVersion === CURRENT_URL_VERSION) {
    // Do not upgrade when either profile data is null or url is on the latest
    // version already. Profile can be null only when the source could not provide
    // that for upgrader and therefore upgrading step is not needed (e.g. 'from-browser').
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
    let destVersion = urlVersion + 1;
    destVersion <= CURRENT_URL_VERSION;
    destVersion++
  ) {
    if (destVersion in _upgraders) {
      const upgrader = _upgraders[destVersion];
      upgrader(processedLocation, profile);
    }
  }

  processedLocation.query.v = CURRENT_URL_VERSION;
  return processedLocation;
}

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the processedLocation as its first argument and mutates it.
// If available, the profile is passed as the second argument, for any upgraders that need it.
/* eslint-disable no-useless-computed-key */
const _upgraders: {|
  [number]: (
    location: ProcessedLocationBeforeUpgrade,
    profile?: Profile
  ) => void,
|} = {
  [1]: (processedLocation: ProcessedLocationBeforeUpgrade) => {
    // Version 1 is the first versioned url. Do some best-effort upgrading from
    // un-versioned URLs.

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

    // The transform stack was added. Convert the callTreeFilters into the new
    // transforms format.
    if (processedLocation.query.callTreeFilters) {
      // Before: "callTreeFilters=prefix-0KV4KV5KV61KV7KV8K~postfixjs-xFFpUMl"
      // After: "transforms=f-combined-0KV4KV5KV61KV7KV8K~f-js-xFFpUMl-i"
      processedLocation.query.transforms =
        processedLocation.query.callTreeFilters
          .split('~')
          .map((s) => {
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
          .filter((f) => f)
          .join('~');
      delete processedLocation.query.callTreeFilters;
    }
  },
  [2]: (processedLocation: ProcessedLocationBeforeUpgrade) => {
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
  [3]: (processedLocation: ProcessedLocationBeforeUpgrade) => {
    const { query } = processedLocation;
    // Removed "Hide platform details" checkbox from the stack chart.
    if ('hidePlatformDetails' in query) {
      delete query.hidePlatformDetails;
      query.implementation = 'js';
    }
  },
  [4]: (
    processedLocation: ProcessedLocationBeforeUpgrade,
    profile?: Profile
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

    const transforms = parseTransforms(query.transforms);

    if (!transforms || transforms.length === 0) {
      // We don't have any transforms to upgrade.
      return;
    }

    // The transform stack is for the selected thread.
    // At the time this upgrader was written, there was only one selected thread.
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

    processedLocation.query.transforms = stringifyTransforms(transforms);
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
      .map((committedRange) => {
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
  [6]: ({ query }: ProcessedLocationBeforeUpgrade) => {
    // The tracks-related query arguments have been converted to use uintarray-encoding.
    // Update them from the 0-10-9-8-1-2-3-4-5-6-7 syntax to the "0aw81w7" syntax.
    if (query.globalTrackOrder) {
      const globalTrackOrder = (query.globalTrackOrder: string)
        .split('-')
        .map((s) => +s);
      query.globalTrackOrder =
        encodeUintArrayForUrlComponent(globalTrackOrder) || undefined;
    }
    if (query.hiddenGlobalTracks) {
      const hiddenGlobalTracks = new Set(
        (query.hiddenGlobalTracks: string).split('-').map((s) => +s)
      );
      query.hiddenGlobalTracks =
        encodeUintSetForUrlComponent(hiddenGlobalTracks) || undefined;
    }
    if (query.hiddenLocalTracksByPid) {
      query.hiddenLocalTracksByPid = (query.hiddenLocalTracksByPid: string)
        .split('~')
        .map((pidAndTracks) => {
          const [pid, ...tracks] = pidAndTracks.split('-');
          const hiddenTracks = new Set(tracks.map((s) => +s));
          return `${pid}-${encodeUintSetForUrlComponent(hiddenTracks)}`;
        })
        .join('~');
    }
    if (query.localTrackOrderByPid) {
      query.localTrackOrderByPid = (query.localTrackOrderByPid: string)
        .split('~')
        .map((pidAndTracks) => {
          const [pid, ...tracks] = pidAndTracks.split('-');
          const trackOrder = tracks.map((s) => +s);
          return `${pid}-${encodeUintArrayForUrlComponent(trackOrder)}`;
        })
        .join('~');
    }
    if (query.thread) {
      const selectedThreads = new Set(query.thread.split(',').map((n) => +n));
      query.thread = encodeUintSetForUrlComponent(selectedThreads);
    }

    // In this version, uintarray-encoding started supporting a range syntax:
    // Instead of "abcd" we now support "awd" as a shortcut.
    // This is not only used for the track index properties that we converted
    // above, it also affects any cell tree transforms stored in the URL.
    // However, the change to the uintarray encoding is backwards compatible in
    // such a way that old encodings can still be decoded with the new version,
    // without any change in meaning.
    // As a result, we don't need to do any upgrading for call tree transforms:
    // Old URLs still work with the new version, they're just potentially more
    // verbose. And they get collapsed to the range syntax automatically.
    // Moreover, the new URL version ensures that we don't attempt to interpret
    // new URLs with old profiler versions.

    // There was another change in this version: query.transforms now stores a
    // different value when multiple threads are selected. Rather than storing
    // a list of transform stacks for the individual threads, it now stores the
    // transform stack for the combined thread.
    // We can discard any transforms for individual threads because they're not
    // affecting the current view; the current view displays the combined thread.
    // And the old format of semicolon-separated transform stacks is no longer
    // parsed.
    if (query.transforms && query.transforms.includes(';')) {
      delete query.transforms;
    }
  },
};

for (let destVersion = 1; destVersion <= CURRENT_URL_VERSION; destVersion++) {
  if (!_upgraders[destVersion]) {
    throw new Error(`There is no upgrader for version ${destVersion}.`);
  }
}

for (const destVersionStr of Object.keys(_upgraders)) {
  const destVersion = +destVersionStr;
  if (destVersion > CURRENT_URL_VERSION) {
    throw new Error(oneLine`
      There is an upgrader for version ${destVersion}, which is larger than
      CURRENT_URL_VERSION (${CURRENT_URL_VERSION}). If you added a new upgrader,
      make sure and bump the CURRENT_URL_VERSION variable.
    `);
  }
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
  tabID: number | null
): TimelineTrackOrganization {
  // Pretend this is a TimelineTrackOrganization so that we can exhaustively
  // go through each option.
  const timelineTrackOrganization: TimelineTrackOrganization = ({ type }: any);
  switch (timelineTrackOrganization.type) {
    case 'full':
      return { type: 'full' };
    case 'active-tab':
      return { type: 'active-tab', tabID };
    case 'origins':
      return { type: 'origins' };
    default:
      // Type assert we've checked everythign:
      (timelineTrackOrganization: empty);

      return { type: 'full' };
  }
}

/**
 * Validate the timeline type and fall back to the category type if it's not
 * provided or something else is provided for some reason.
 */
function validateTimelineType(type: ?string): TimelineType {
  // Pretend this is a TimelineTrackOrganization so that we can exhaustively
  // go through each option.
  const timelineType: TimelineType = (type: any);
  switch (timelineType) {
    case 'stack':
    case 'cpu-category':
    case 'category':
      return timelineType;
    default:
      // Type assert we've checked everything:
      (timelineType: empty);
      return 'category';
  }
}
