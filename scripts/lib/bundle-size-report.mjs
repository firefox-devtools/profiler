/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Renders the bundle size report from measured sizes. This file has no
// imports, so the report workflow runs it as is.

export const reportConfig = {
  title: 'Profiler Bundle Size Reporter',
  // The level closest to what Netlify serves in production.
  brotliLevel: 4,
  // Per MB of JavaScript, from the main bundle in Firefox 160 on an Apple
  // M5 Pro. The memory follows Firefox's ScriptLoader.cpp ("~3.8x").
  costEstimate: {
    bundle: 'Main bundle',
    compileMsPerMB: 24,
    evaluateMsPerMB: 8,
    memoryBytesPerByte: 3.8,
  },
};

export const NO_BASELINE_NOTE =
  'The sizes of the base commit are not saved yet.';

const BROTLI_HEADER = `Brotli (level ${reportConfig.brotliLevel})`;

// Both sizes of a list of files or assets, added up in one pass.
export const getTotal = (items) =>
  items.reduce(
    (total, { size, brotliSize }) => {
      total.size += size;
      total.brotliSize += brotliSize;
      return total;
    },
    { size: 0, brotliSize: 0 }
  );
const getSizesByName = (items) =>
  new Map((items ?? []).map((item) => [item.name, item]));

// A column has a header and computes its cell for an item.
const toTable = (columns, items) => {
  const usedColumns = columns.filter(Boolean);
  return {
    headers: usedColumns.map(({ header }) => header),
    rows: items.map((item) => usedColumns.map(({ cell }) => cell(item))),
  };
};

export function formatSize(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

export function formatChange(size, baselineSize) {
  if (baselineSize === undefined) {
    return 'N/A';
  }
  const delta = size - baselineSize;
  if (delta === 0) {
    return '-';
  }
  const sign = delta > 0 ? '+' : '-';
  // A change of a few bytes would round to 0.00 kB.
  if (Math.abs(delta) < 10) {
    return `${sign}${Math.abs(delta)} B`;
  }
  const change = `${sign}${formatSize(Math.abs(delta))}`;
  if (baselineSize === 0) {
    return change;
  }
  const percent = ((Math.abs(delta) / baselineSize) * 100).toFixed(2);
  return `${change} (${sign}${percent}%)`;
}

function formatLimit({ sizeLimit, passed }) {
  if (sizeLimit === undefined) {
    return '';
  }
  return passed ? formatSize(sizeLimit) : `${formatSize(sizeLimit)} (over)`;
}

export function buildReportTable(entries, baseline, assets) {
  const baselineEntries = getSizesByName(baseline?.entries);
  const hasLimit = entries.some(({ sizeLimit }) => sizeLimit !== undefined);

  const items = entries.map((entry) => ({
    ...entry,
    baseline: baselineEntries.get(entry.name),
  }));
  items.push({
    name: 'Total',
    ...getTotal(assets),
    baseline: baseline?.assets && getTotal(baseline.assets),
  });

  return toTable(
    [
      { header: 'Bundle', cell: ({ name }) => name },
      { header: 'Uncompressed', cell: ({ size }) => formatSize(size) },
      baseline && {
        header: 'Change',
        cell: (item) => formatChange(item.size, item.baseline?.size),
      },
      hasLimit && { header: 'Limit', cell: formatLimit },
      {
        header: BROTLI_HEADER,
        cell: ({ brotliSize }) => formatSize(brotliSize),
      },
      baseline && {
        header: 'Change',
        cell: (item) =>
          formatChange(item.brotliSize, item.baseline?.brotliSize),
      },
    ],
    items
  );
}

// Estimates the cost of the bundle once loaded, or of its change when there
// is a baseline.
export function describeCostHint(entries, baseline) {
  const { bundle, compileMsPerMB, evaluateMsPerMB, memoryBytesPerByte } =
    reportConfig.costEstimate;
  const { size } = entries.find(({ name }) => name === bundle);
  const baselineSize = getSizesByName(baseline?.entries).get(bundle)?.size;
  const delta = size - (baselineSize ?? size);
  // Under 1 kB, the change is too small to show, so the whole cost is.
  const change = Math.abs(delta) >= 1000 ? delta : 0;
  const bytes = Math.abs(change) || size;
  const sign = ['-', '', '+'][Math.sign(change) + 1];

  const formatTime = (millisecondsPerMB) => {
    const milliseconds = (bytes / 1_000_000) * millisecondsPerMB;
    return `${milliseconds.toFixed(milliseconds < 10 ? 1 : 0)}ms`;
  };
  const memory = bytes * memoryBytesPerByte;
  const formattedMemory =
    memory >= 1_000_000
      ? `${(memory / 1_000_000).toFixed(1)}MB`
      : `${(memory / 1000).toFixed(0)}kB`;

  return [
    `compile time: ~${sign}${formatTime(compileMsPerMB)}`,
    `eval: ~${sign}${formatTime(evaluateMsPerMB)}`,
    `memory: ~${sign}${formattedMemory}`,
  ].join('; ');
}

// Every asset, largest first, total last.
export function buildAssetsTable(assets, baseline) {
  const baselineAssets = baseline?.assets;
  const baselineSizes = getSizesByName(baselineAssets);

  return toTable(
    [
      {
        header: 'Asset',
        cell: ({ name, files }) =>
          files > 1 ? `${name} (${files} files)` : name,
      },
      { header: 'Uncompressed', cell: ({ size }) => formatSize(size) },
      baselineAssets && {
        header: 'Change',
        cell: ({ size, baselineSize }) => formatChange(size, baselineSize),
      },
      {
        header: BROTLI_HEADER,
        cell: ({ brotliSize }) => formatSize(brotliSize),
      },
    ],
    assets
      .toSorted((a, b) => b.size - a.size)
      .map((asset) => ({
        ...asset,
        baselineSize: baselineSizes.get(asset.name)?.size,
      }))
      .concat({
        name: 'Total',
        ...getTotal(assets),
        baselineSize: baselineAssets && getTotal(baselineAssets).size,
      })
  );
}

// The assets that changed since the baseline, or null.
export function buildChangedAssetsTable(assets, baseline) {
  const baselineAssets = baseline?.assets;
  if (!baselineAssets) {
    return null;
  }
  const baselineSizes = getSizesByName(baselineAssets);
  const names = new Set(assets.map(({ name }) => name));
  const { size: totalSize } = getTotal(assets);

  const changes = assets.reduce((list, { name, size }) => {
    const baselineSize = baselineSizes.get(name)?.size;
    if (baselineSize !== size) {
      list.push({
        name,
        size,
        delta: size - (baselineSize ?? 0),
        change:
          baselineSize === undefined ? 'new' : formatChange(size, baselineSize),
      });
    }
    return list;
  }, []);
  baselineAssets.reduce((list, { name, size }) => {
    if (!names.has(name)) {
      list.push({ name, size: 0, delta: -size, change: 'removed' });
    }
    return list;
  }, changes);
  if (changes.length === 0) {
    return null;
  }

  return toTable(
    [
      { header: 'Asset', cell: ({ name }) => name },
      { header: 'Uncompressed', cell: ({ size }) => formatSize(size) },
      { header: 'Change', cell: ({ change }) => change },
    ],
    changes
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .concat({
        name: 'Total',
        size: totalSize,
        change: formatChange(totalSize, getTotal(baselineAssets).size),
      })
  );
}

function renderTable({ headers, rows }) {
  const toLine = (cells) => `| ${cells.join(' | ')} |`;
  const alignment = headers.map((_, index) => (index === 0 ? ':--' : '--:'));
  return [toLine(headers), toLine(alignment), ...rows.map(toLine)];
}

function renderDetails(title, table) {
  if (!table) {
    return [];
  }
  return [
    '',
    '<details>',
    `<summary>${title}</summary>`,
    '',
    ...renderTable(table),
    '',
    '</details>',
  ];
}

// With isBaselineExpected, the report mentions a baseline that is not saved
// yet.
export function renderReport(
  entries,
  baseline,
  assets,
  { isBaselineExpected = false } = {}
) {
  const comparedTo = baseline?.commit?.slice(0, 9) ?? 'the provided baseline';
  const note = isBaselineExpected ? ['', NO_BASELINE_NOTE] : [];
  const comparison = baseline ? ['', `Compared to ${comparedTo}.`] : note;
  return [
    `### ${reportConfig.title}`,
    '',
    ...renderTable(buildReportTable(entries, baseline, assets)),
    ...comparison,
    '',
    `_${describeCostHint(entries, baseline)}_`,
    ...renderDetails(
      'Full app size detail',
      buildAssetsTable(assets, baseline)
    ),
    ...renderDetails(
      'Changed files',
      buildChangedAssetsTable(assets, baseline)
    ),
    '',
  ].join('\n');
}

const NAME_PATTERN = /^[\w .*/()-]{1,100}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;
const isSize = (value) => Number.isSafeInteger(value) && value >= 0;

// One measured item with its known fields, or null. The names and numbers
// are checked because the report workflow reads sizes measured by a pull
// request.
function parseMeasure(item) {
  const { name, size, brotliSize, files, sizeLimit, passed } = item ?? {};
  const isValid =
    typeof name === 'string' &&
    NAME_PATTERN.test(name) &&
    isSize(size) &&
    [brotliSize, files, sizeLimit].every(
      (value) => value === undefined || isSize(value)
    ) &&
    (passed === undefined || typeof passed === 'boolean');
  if (!isValid) {
    return null;
  }
  return Object.fromEntries(
    Object.entries({ name, files, size, brotliSize, sizeLimit, passed }).filter(
      ([, value]) => value !== undefined
    )
  );
}

function parseMeasures(items, maxLength) {
  if (!Array.isArray(items) || items.length > maxLength) {
    return null;
  }
  const measures = items.map(parseMeasure);
  return measures.includes(null) ? null : measures;
}

// Keeps what can be compared from sizes written with --output, or null.
export function parseBaseline(baseline) {
  const { commit, entries, assets } = baseline ?? {};
  const parsedEntries = parseMeasures(entries, 100);
  const parsedAssets = parseMeasures(assets, 1000);
  if (!parsedEntries || !parsedAssets) {
    return null;
  }
  return {
    commit:
      typeof commit === 'string' && COMMIT_PATTERN.test(commit)
        ? commit
        : undefined,
    entries: parsedEntries,
    assets: parsedAssets,
  };
}
