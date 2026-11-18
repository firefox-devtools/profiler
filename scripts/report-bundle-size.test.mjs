/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from 'assert/strict';
import { test } from 'node:test';

import {
  NO_BASELINE_NOTE,
  buildChangedAssetsTable,
  buildReportTable,
  describeCostHint,
  formatChange,
  parseBaseline,
  renderReport,
} from './lib/bundle-size-report.mjs';
import {
  getAssetName,
  getEntrySize,
  groupAssets,
} from './report-bundle-size.mjs';

const entries = [
  { name: 'Main bundle', size: 1451966, brotliSize: 349933 },
  { name: 'Source map worker', size: 264913, brotliSize: 35608 },
];

// The whole build, which the main table totals.
const reportAssets = [
  { name: 'index-*.js', files: 1, size: 1451966, brotliSize: 349933 },
  {
    name: 'source-map.worker-*.js',
    files: 1,
    size: 264913,
    brotliSize: 35608,
  },
  { name: 'mappings.wasm', files: 1, size: 100000, brotliSize: 40000 },
];

test('formatChange reports the difference to the baseline', () => {
  assert.equal(formatChange(1000, undefined), 'N/A');
  assert.equal(formatChange(1000, 1000), '-');
  assert.equal(formatChange(110000, 100000), '+10.00 kB (+10.00%)');
  assert.equal(formatChange(90000, 100000), '-10.00 kB (-10.00%)');
  assert.equal(formatChange(1500, 0), '+1.50 kB');
  assert.equal(formatChange(1001, 1000), '+1 B');
  assert.equal(formatChange(991, 1000), '-9 B');
});

test('buildReportTable shows the limits next to the uncompressed sizes', () => {
  const entriesWithLimits = [
    {
      name: 'Main bundle',
      size: 1451966,
      brotliSize: 349933,
      sizeLimit: 1400000,
      passed: false,
    },
    {
      name: 'All JavaScript',
      size: 2448274,
      brotliSize: 629720,
      sizeLimit: 2500000,
      passed: true,
    },
    { name: 'Source map worker', size: 264913, brotliSize: 35608 },
  ];

  assert.deepEqual(buildReportTable(entriesWithLimits, null, reportAssets), {
    headers: ['Bundle', 'Uncompressed', 'Limit', 'Brotli (level 4)'],
    rows: [
      ['Main bundle', '1451.97 kB', '1400.00 kB (over)', '349.93 kB'],
      ['All JavaScript', '2448.27 kB', '2500.00 kB', '629.72 kB'],
      ['Source map worker', '264.91 kB', '', '35.61 kB'],
      ['Total', '1816.88 kB', '', '425.54 kB'],
    ],
  });
});

test('renderReport outputs the tables, the baseline and the cost hint', () => {
  const baseline = {
    commit: '28a1b264e774431b894b2e6b2b3aaa0cf120a587',
    entries: [
      { name: 'Main bundle', size: 1400000, brotliSize: 349933 },
      { name: 'Source map worker', size: 260000, brotliSize: 35000 },
    ],
    assets: [
      { name: 'index-*.js', files: 1, size: 1400000, brotliSize: 340000 },
    ],
  };
  const assets = [
    { name: 'index-*.js', files: 1, size: 1451966, brotliSize: 349933 },
  ];

  assert.equal(
    renderReport(entries, baseline, assets),
    [
      '### Profiler Bundle Size Reporter',
      '',
      '| Bundle | Uncompressed | Change | Brotli (level 4) | Change |',
      '| :-- | --: | --: | --: | --: |',
      '| Main bundle | 1451.97 kB | +51.97 kB (+3.71%) | 349.93 kB | - |',
      '| Source map worker | 264.91 kB | +4.91 kB (+1.89%) | 35.61 kB | +0.61 kB (+1.74%) |',
      '| Total | 1451.97 kB | +51.97 kB (+3.71%) | 349.93 kB | +9.93 kB (+2.92%) |',
      '',
      'Compared to 28a1b264e.',
      '',
      '_compile time: ~+1.2ms; eval: ~+0.4ms; memory: ~+197kB_',
      '',
      '<details>',
      '<summary>Full app size detail</summary>',
      '',
      '| Asset | Uncompressed | Change | Brotli (level 4) |',
      '| :-- | --: | --: | --: |',
      '| index-*.js | 1451.97 kB | +51.97 kB (+3.71%) | 349.93 kB |',
      '| Total | 1451.97 kB | +51.97 kB (+3.71%) | 349.93 kB |',
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Changed files</summary>',
      '',
      '| Asset | Uncompressed | Change |',
      '| :-- | --: | --: |',
      '| index-*.js | 1451.97 kB | +51.97 kB (+3.71%) |',
      '| Total | 1451.97 kB | +51.97 kB (+3.71%) |',
      '',
      '</details>',
      '',
    ].join('\n')
  );
});

test('renderReport leaves out the changes without a baseline', () => {
  const report = renderReport(entries, null, [
    { name: 'index-*.js', files: 1, size: 1451966, brotliSize: 349933 },
  ]);
  assert.ok(!report.includes('Compared to'));
  assert.ok(!report.includes('Change'));
  assert.ok(!report.includes(NO_BASELINE_NOTE));
  assert.ok(
    renderReport(entries, null, reportAssets, {
      isBaselineExpected: true,
    }).includes(`\n\n${NO_BASELINE_NOTE}\n`)
  );
  assert.ok(
    report.includes('_compile time: ~35ms; eval: ~12ms; memory: ~5.5MB_')
  );
});

test('describeCostHint estimates the time and memory cost of the first entry', () => {
  const baselineWith = (size) => ({
    entries: [{ name: 'Main bundle', size, brotliSize: 300000 }],
  });

  assert.equal(
    describeCostHint(entries, null),
    'compile time: ~35ms; eval: ~12ms; memory: ~5.5MB'
  );
  assert.equal(
    describeCostHint(entries, baselineWith(1451966)),
    'compile time: ~35ms; eval: ~12ms; memory: ~5.5MB'
  );
  assert.equal(
    describeCostHint(entries, baselineWith(1400000)),
    'compile time: ~+1.2ms; eval: ~+0.4ms; memory: ~+197kB'
  );
  assert.equal(
    describeCostHint(entries, baselineWith(1666666)),
    'compile time: ~-5.2ms; eval: ~-1.7ms; memory: ~-816kB'
  );
});

test('getAssetName gathers the files of the build under readable names', () => {
  const names = {
    // The hash of esbuild, and the one of workbox.
    'index-F7T2MMLF.js': 'index-*.js',
    'index-NFSFAHXV.css': 'index-*.css',
    'index_bg-FTIMKZRG.wasm': 'index_bg-*.wasm',
    'chunk-BMYVS6MU.js': 'chunk-*.js',
    'workbox-071134d9.js': 'workbox-*.js',
    // The names with dots and dashes keep them.
    'source-map.worker-EFB37NDI.js': 'source-map.worker-*.js',
    'jszip.min-FMRUWSYI.js': 'jszip.min-*.js',
    'perf-screenshot-2021-05-06-7XO3YOT4.jpg':
      'perf-screenshot-2021-05-06-*.jpg',
    // The files without a hash keep their name.
    'mappings.wasm': 'mappings.wasm',
    'service-worker-compat.js': 'service-worker-compat.js',
    'index.html': 'index.html',
    'sw.js': 'sw.js',
    // The files of a folder go under the folder.
    'locales/fr/app.ftl': 'locales/',
    'res/img/svg/logo-ABCDEFGH.svg': 'res/',
  };
  for (const [file, name] of Object.entries(names)) {
    assert.equal(getAssetName(file), name, file);
  }
});

const assets = [
  { name: 'chunk-*.js', files: 7, size: 400000, brotliSize: 120000 },
  { name: 'index-*.js', files: 1, size: 1451966, brotliSize: 349933 },
  { name: 'locales/', files: 20, size: 9000000, brotliSize: 2000000 },
];

test('buildChangedAssetsTable only lists what changed since the baseline', () => {
  const baseline = {
    entries: [],
    assets: [
      { name: 'index-*.js', files: 1, size: 1400000, brotliSize: 340000 },
      { name: 'locales/', files: 20, size: 9000000, brotliSize: 2000000 },
      { name: 'legacy.js', files: 1, size: 10000, brotliSize: 3000 },
    ],
  };

  assert.deepEqual(buildChangedAssetsTable(assets, baseline), {
    headers: ['Asset', 'Uncompressed', 'Change'],
    rows: [
      ['chunk-*.js', '400.00 kB', 'new'],
      ['index-*.js', '1451.97 kB', '+51.97 kB (+3.71%)'],
      ['legacy.js', '0.00 kB', 'removed'],
      ['Total', '10851.97 kB', '+441.97 kB (+4.25%)'],
    ],
  });
  assert.equal(buildChangedAssetsTable(assets, null), null);
  assert.equal(buildChangedAssetsTable(assets, { entries: [], assets }), null);
});

const files = [
  { path: 'dist/index-G3JJAJ32.js', size: 1000, brotliSize: 300 },
  { path: 'dist/chunk-AAAAAAA1.js', size: 200, brotliSize: 60 },
  { path: 'dist/chunk-BBBBBBB2.js', size: 100, brotliSize: 30 },
  { path: 'dist/sw.js', size: 50, brotliSize: 20 },
  { path: 'dist/locales/fr/app.ftl', size: 70, brotliSize: 14 },
];

test('getEntrySize adds up the files matching the pattern of an entry', () => {
  assert.deepEqual(getEntrySize('dist/index-*.js', files), {
    size: 1000,
    brotliSize: 300,
  });
  assert.deepEqual(getEntrySize('dist/chunk-*.js', files), {
    size: 300,
    brotliSize: 90,
  });
  assert.deepEqual(getEntrySize('dist/*.wasm', files), {
    size: 0,
    brotliSize: 0,
  });
});

test('groupAssets gathers the files by asset name', () => {
  assert.deepEqual(groupAssets(files), [
    { name: 'index-*.js', files: 1, size: 1000, brotliSize: 300 },
    { name: 'chunk-*.js', files: 2, size: 300, brotliSize: 90 },
    { name: 'sw.js', files: 1, size: 50, brotliSize: 20 },
    { name: 'locales/', files: 1, size: 70, brotliSize: 14 },
  ]);
});

test('parseBaseline keeps the names and numbers a report can show', () => {
  const parse = (entry) => parseBaseline({ entries: [entry], assets: [] });
  const baseline = { commit: '28a1b264e', entries, assets: reportAssets };

  assert.deepEqual(parseBaseline(baseline), baseline);
  assert.equal(parseBaseline(null), null);
  assert.equal(parseBaseline({ entries }), null);

  assert.deepEqual(
    parse({ name: 'Main bundle', size: 10, brotliSize: 5, other: 'x' }).entries,
    [{ name: 'Main bundle', size: 10, brotliSize: 5 }]
  );
  assert.equal(parse({ name: '[a link](https://example.com)', size: 1 }), null);
  assert.equal(parse({ name: '@someone', size: 1 }), null);
  assert.equal(parse({ name: 'a\nb', size: 1 }), null);
  assert.equal(parse({ name: 'a'.repeat(101), size: 1 }), null);
  assert.equal(parse({ name: 'Main bundle', size: -1 }), null);
  assert.equal(parse({ name: 'Main bundle', size: 1.5 }), null);
  assert.equal(parse({ name: 'Main bundle', size: '10' }), null);
  assert.equal(parse({ name: 'Main bundle', size: 1, brotliSize: 'x' }), null);
  assert.equal(
    parseBaseline({ commit: 'main; echo', entries: [], assets: [] }).commit,
    undefined
  );
  assert.equal(
    parseBaseline({
      entries: Array(101).fill({ name: 'a', size: 1 }),
      assets: [],
    }),
    null
  );
});

test('describeCostHint shows the whole cost for a change under 1 kB', () => {
  const baseline = {
    entries: [{ name: 'Main bundle', size: 1451966 - 999 }],
  };
  assert.equal(
    describeCostHint(entries, baseline),
    'compile time: ~35ms; eval: ~12ms; memory: ~5.5MB'
  );
});
