
export function parseRangeFilters(stringValue = '') {
  if (!stringValue) {
    return [];
  }
  return stringValue.split('~').map(s => {
    const m = s.match(/(-?[0-9.]+)_(-?[0-9.]+)/);
    if (!m) {
      return { start: 0, end: 1000 };
    }
    return { start: m[1] * 1000, end: m[2] * 1000 };
  });
}

export function stringifyRangeFilters(arrayValue = []) {
  return arrayValue.map(({ start, end }) => {
    const startStr = (start / 1000).toFixed(4);
    const endStr = (end / 1000).toFixed(4);
    return `${startStr}_${endStr}`;
  }).join('~');
}

export function getRangeFilterLabels(rangeFilters) {
  const labels = rangeFilters.map(range => {
    return `Range: ${(range.start / 1000).toFixed(2)}s–${(range.end / 1000).toFixed(2)}s`;
  });
  labels.unshift('Complete Profile');
  return labels;
}
