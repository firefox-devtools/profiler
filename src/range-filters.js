
export function parseRangeFilters(stringValue = '') {
  if (!stringValue) {
    return [];
  }
  return stringValue.split('~').map(s => {
    const m = s.match(/range_(\-?[0-9.]+)\-(\-?[0-9.]+)/);
    if (!m) {
      return { start: 0, end: 1 };
    }
    return { start: m[1] * 1, end: m[2] * 1 };
  });
}

export function stringifyRangeFilters(arrayValue = []) {
  return arrayValue.map(({ start, end }) => `range_${start}-${end}`).join('~');
}
