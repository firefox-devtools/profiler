import queryString from 'query-string';
import { stringifyRangeFilters, parseRangeFilters } from './range-filters';
import { stringifyCallTreeFilters, parseCallTreeFilters } from './call-tree-filters';

// {
//   // general:
//   dataSource: 'from-addon', 'local', 'public',
//   hash: '' or 'aoeurschsaoeuch',
//   selectedTab: 'summary' or 'calltree' or ...,
//   rangeFilters: [] or [{ start, end }, ...],
//   selectedThread: 0 or 1 or ...,
//   
//   // only when selectedTab === 'calltree':
//   callTreeSearchString: '' or '::RunScript' or ...,
//   callTreeFilters: [[], [{type:'prefix', matchJSOnly:true, prefixFuncs:[1,3,7]}, {}, ...], ...], // one per thread
//   jsOnly: false or true,
//   invertCallstack: false or true,
// }

function dataSourceDirs(urlState) {
  const { dataSource } = urlState;
  switch (dataSource) {
    case 'from-addon':
      return ['from-addon'];
    case 'local':
      return ['local', urlState.hash];
    case 'public':
      return ['public', urlState.hash];
    default:
      return [];
  }
}

export function urlFromState(urlState) {
  const { dataSource } = urlState;
  if (dataSource === 'none') {
    return '/';
  }
  const pathname = '/' + [
    ...dataSourceDirs(urlState),
    urlState.selectedTab,
  ].join('/') + '/';
  const query = Object.assign({
    range: stringifyRangeFilters(urlState.rangeFilters) || undefined,
    thread: `${urlState.selectedThread}`,
  }, urlState.selectedTab === 'calltree' ? {
    search: urlState.callTreeSearchString || undefined,
    invertCallstack: urlState.invertCallstack ? null : undefined,
    jsOnly: urlState.jsOnly ? null : undefined,
    callTreeFilters: stringifyCallTreeFilters(urlState.callTreeFilters[urlState.selectedThread]) || undefined,
  } : {});
  const qString = queryString.stringify(query);
  return pathname + (qString ? '?' + qString : '');
}

export function stateFromURL(url) {
  const [pathname, qString] = url.split('?');
  const dirs = pathname.split('/').filter(d => d);
  const dataSource = dirs[0] || 'none';
  if (!['none', 'from-addon', 'local', 'public'].includes(dataSource)) {
    throw new Error('unexpected data source');
  }
  const needHash = ['local', 'public'].includes(dataSource);
  const query = queryString.parse(qString);
  const selectedThread = query.thread !== undefined ? +query.thread : 0;
  return {
    dataSource,
    hash: needHash ? dirs[1] : '',
    selectedTab: (needHash ? dirs[2] : dirs[1]) || 'calltree',
    rangeFilters: query.range ? parseRangeFilters(query.range) : [],
    selectedThread: selectedThread,
    callTreeSearchString: query.search || '',
    callTreeFilters: {
      [selectedThread]: query.callTreeFilters ? parseCallTreeFilters(query.callTreeFilters) : [],
    },
    jsOnly: query.jsOnly !== undefined,
    invertCallstack: query.invertCallstack !== undefined,
  };
}
