/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import queryString from 'query-string';
import {
  stringifyRangeFilters,
  parseRangeFilters,
} from './profile-logic/range-filters';
import {
  stringifyTransforms,
  parseTransforms,
} from './profile-logic/transforms';
import type { URLState } from './types/reducers';
import type { DataSource } from './types/actions';

function dataSourceDirs(urlState: URLState) {
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
      return ['from-url', encodeURIComponent(urlState.profileURL)];
    default:
      return [];
  }
}

// "null | void" in the query objects are flags which map to true for null, and false
// for void. False flags do not show up the URL.
type BaseQuery = {
  range: string, //
  thread: string, // "3"
  threadOrder: string, // "3-2-0-1"
  hiddenThreads: string, // "0-1"
  react_perf: null | void, // Flag to activate react's UserTimings profiler.
};

type CallTreeQuery = BaseQuery & {
  search: string, // "js::RunScript"
  invertCallstack: null | void,
  implementation: string,
};

type MarkersQuery = BaseQuery & {
  markerSearch: string, // "DOMEvent"
};

type TimelineQuery = BaseQuery & {
  search: string, // "js::RunScript"
  invertCallstack: null | void,
  hidePlatformDetails: null | void,
};

type URLObject = {
  pathParts: string[],
  query: Query,
};

type Query = null | BaseQuery | CallTreeQuery | MarkersQuery | TimelineQuery;

/**
 * Take the URLState and map it into a serializable URLObject, that represents the
 * target URL.
 */
export function urlStateToURLObject(urlState: URLState): URLObject {
  const { dataSource } = urlState;
  if (dataSource === 'none') {
    return {
      pathParts: [],
      query: null,
    };
  }
  const pathParts = [...dataSourceDirs(urlState), urlState.selectedTab];

  // Start with the query parameters that are shown regardless of the active tab.
  const query: Object = {
    range: stringifyRangeFilters(urlState.rangeFilters) || undefined,
    thread: `${urlState.selectedThread}`,
    threadOrder: urlState.threadOrder.join('-'),
    hiddenThreads: urlState.hiddenThreads.join('-'),
  };

  if (process.env.NODE_ENV === 'development') {
    /* eslint-disable camelcase */
    query.react_perf = null;
    /* eslint-enable camelcase */
  }

  // Depending on which tab is active, also show tab-specific query parameters.
  switch (urlState.selectedTab) {
    case 'calltree':
      query.search = urlState.callTreeSearchString || undefined;
      query.invertCallstack = urlState.invertCallstack ? null : undefined;
      query.implementation =
        urlState.implementation === 'combined'
          ? undefined
          : urlState.implementation;
      query.transforms =
        stringifyTransforms(urlState.transforms[urlState.selectedThread]) ||
        undefined;
      break;
    case 'markers':
      query.markerSearch = urlState.markersSearchString;
      break;
    case 'timeline':
      query.search = urlState.callTreeSearchString || undefined;
      query.invertCallstack = urlState.invertCallstack ? null : undefined;
      query.hidePlatformDetails = urlState.hidePlatformDetails
        ? null
        : undefined;
      break;
    default:
  }
  return { query, pathParts };
}

export function urlFromState(urlState: URLState): string {
  const { pathParts, query } = urlStateToURLObject(urlState);
  const { dataSource } = urlState;
  if (dataSource === 'none') {
    return '/';
  }
  const pathname =
    pathParts.length === 0 ? '/' : '/' + pathParts.join('/') + '/';

  const qString = queryString.stringify(query);
  return pathname + (qString ? '?' + qString : '');
}

function getDataSourceFromPathParts(pathParts: string[]): DataSource {
  const str = pathParts[0] || 'none';
  // With this switch, flow is able to understand that we return a valid value
  switch (str) {
    case 'none':
    case 'from-addon':
    case 'from-file':
    case 'local':
    case 'public':
    case 'from-url':
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

export function stateFromLocation(location: Location): URLState {
  const { pathname, query } = upgradeLocationToCurrentVersion({
    pathname: location.pathname,
    hash: location.hash,
    query: queryString.parse(location.search.substr(1)),
  });

  const pathParts = pathname.split('/').filter(d => d);
  const dataSource = getDataSourceFromPathParts(pathParts);
  const selectedThread = query.thread !== undefined ? +query.thread : 0;

  // https://perf-html.io/public/{hash}/calltree/
  const hasProfileHash = ['local', 'public'].includes(dataSource);

  // https://perf-html.io/from-url/{url}/calltree/
  const hasProfileURL = ['from-url'].includes(dataSource);

  // The selected tab is the last path part in the URL.
  const selectedTabPathPart = hasProfileHash || hasProfileURL ? 2 : 1;

  let implementation = 'combined';
  // Don't trust the implementation values from the user. Make sure it conforms
  // to known values.
  if (query.implementation === 'js' || query.implementation === 'cpp') {
    implementation = query.implementation;
  }

  return {
    dataSource,
    hash: hasProfileHash ? pathParts[1] : '',
    profileURL: hasProfileURL ? decodeURIComponent(pathParts[1]) : '',
    selectedTab: pathParts[selectedTabPathPart] || 'calltree',
    rangeFilters: query.range ? parseRangeFilters(query.range) : [],
    selectedThread: selectedThread,
    callTreeSearchString: query.search || '',
    markersSearchString: query.markerSearch || '',
    implementation,
    invertCallstack: query.invertCallstack !== undefined,
    hidePlatformDetails: query.hidePlatformDetails !== undefined,
    hiddenThreads: query.hiddenThreads
      ? query.hiddenThreads.split('-').map(index => Number(index))
      : [],
    threadOrder: query.threadOrder
      ? query.threadOrder.split('-').map(index => Number(index))
      : [],
    transforms: {
      [selectedThread]: query.transforms
        ? parseTransforms(query.transforms)
        : [],
    },
  };
}

export const CURRENT_URL_VERSION = 1;

type ProcessedLocation = { pathname: string, hash: string, query: Object };

export function upgradeLocationToCurrentVersion(
  processedLocation: ProcessedLocation
): ProcessedLocation {
  const urlVersion = processedLocation.query.v || 0;
  if (urlVersion === CURRENT_URL_VERSION) {
    return processedLocation;
  }

  if (urlVersion > CURRENT_URL_VERSION) {
    throw new Error(
      `Unable to parse a url of version ${urlVersion} - are you running an outdated version of perf.html? ` +
        `The most recent version understood by this version of perf.html is version ${CURRENT_URL_VERSION}.\n` +
        'You can try refreshing this page in case perf.html has updated in the meantime.'
    );
  }
  // Convert to CURRENT_URL_VERSION, one step at a time.
  for (
    let destVersion = urlVersion;
    destVersion <= CURRENT_URL_VERSION;
    destVersion++
  ) {
    if (destVersion in _upgraders) {
      _upgraders[destVersion](processedLocation);
    }
  }

  processedLocation.query.v = CURRENT_URL_VERSION;
  return processedLocation;
}

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the processedLocation as its single argument and mutates it.
/* eslint-disable no-useless-computed-key */
const _upgraders = {
  [0]: (processedLocation: ProcessedLocation) => {
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
        // Process any legacy filters.
        if ('filter' in legacyQuery) {
          const filters = JSON.parse(legacyQuery.filter);
          // We can't convert these parameters to the new URL parameters here
          // because they're relative to different things - the legacy range
          // filters were relative to profile.meta.startTime, and the new
          // rangeFilters param is relative to
          // getTimeRangeIncludingAllThreads(profile).start.
          // So we stuff this information into a global here, and then later,
          // once we have the profile, we convert that information into URL params
          // again. This is not pretty.
          window.legacyRangeFilters = filters
            .filter(f => f.type === 'RangeSampleFilter')
            .map(({ start, end }) => ({ start, end }));
        }
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
  [1]: (processedLocation: ProcessedLocation) => {
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
};
