import queryString from 'query-string';

export function redirectLegacyUrls() {
  if (location.pathname === '/') {
    const query = Object.assign({}, queryString.parse(location.search), queryString.parse(location.hash));
    let url = '/';
    if ('report' in query) {
      url += `public/${query.report}/`;
    }
    if ('filter' in query) {
      const filters = JSON.parse(query.filter);
      // We can't convert these parameters to the new URL parameters here
      // because they're relative to different things - the legacy range
      // filters were relative to profile.meta.startTime, and the new
      // rangeFilters param is relative to
      // getTimeRangeIncludingAllThreads(profile).start.
      // So we stuff this information into a global here, and then later,
      // once we have the profile, we convert that information into URL params
      // again. This is not pretty.
      window.legacyRangeFilters =
        filters.filter(f => f.type === 'RangeSampleFilter').map(({ start, end }) => ({ start, end }));
    }
    history.replaceState({}, '', url);
  }
}
