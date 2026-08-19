/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import browserslistToEsbuild from 'browserslist-to-esbuild';

import { wasmLoader } from 'esbuild-plugin-wasm';
import copy from 'esbuild-plugin-copy';
import {
  externalChromeUrlsPlugin,
  circularDependencyPlugin,
  generateHtmlPlugin,
} from './esbuild-plugins.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.normalize(path.join(__dirname, '..', '..'));

const isProduction = process.env.NODE_ENV === 'production';

// Configuration shared by both node and browser builds
const baseConfig = {
  bundle: true,
  minify: isProduction,
  absWorkingDir: projectRoot,
  loader: {
    '.png': 'file',
    '.jpg': 'file',
    '.svg': 'dataurl',
    '.worker.js': 'file',
  },
  alias: {
    'firefox-profiler': './src',
    'firefox-profiler-res': './res',
  },
};

// Common build configuration for node-based tools
export const nodeBaseConfig = {
  ...baseConfig,
  platform: 'node',
  target: 'node16',
  splitting: false,
  format: 'cjs',
  bundle: true,
  external: ['fs', 'path', 'crypto', 'zlib'],
  plugins: [
    wasmLoader({
      mode: 'embedded',
    }),
  ],
};

// Main bundle config

const templateHTML = fs.readFileSync(
  path.join(projectRoot, 'res', 'index.html'),
  'utf8'
);

export const mainBundleConfig = {
  ...baseConfig,
  format: 'esm',
  platform: 'browser',
  target: browserslistToEsbuild(),
  sourcemap: true,
  splitting: true,
  entryPoints: ['src/index.tsx'],
  outdir: 'dist',
  metafile: true,
  publicPath: '/',
  entryNames: '[name]-[hash]',
  define: {
    'process.env.L10N': process.env.L10N
      ? JSON.stringify(process.env.L10N)
      : 'undefined',
    AVAILABLE_STAGING_LOCALES: process.env.L10N
      ? JSON.stringify(fs.readdirSync('./locales'))
      : 'undefined',
    // no need to define NODE_ENV:
    // esbuild automatically defines NODE_ENV based on the value for "minify"
    // In dev, the workers are not hashed so their paths are predictable.
    // In production, build.mjs overrides these after building them first.
    SOURCE_MAP_WORKER_PATH: JSON.stringify('/source-map.worker.js'),
    BENCHMARK_COMPARE_WORKER_PATH: JSON.stringify(
      '/benchmark-compare.worker.js'
    ),
  },
  external: ['zlib'],
  plugins: [
    externalChromeUrlsPlugin(),
    circularDependencyPlugin(),
    wasmLoader(),
    copy({
      resolveFrom: projectRoot,
      assets: [
        { from: ['res/_headers'], to: ['dist'] },
        { from: ['res/_redirects'], to: ['dist'] },
        { from: ['res/contribute.json'], to: ['dist'] },
        { from: ['res/robots.txt'], to: ['dist'] },
        { from: ['res/service-worker-compat.js'], to: ['dist'] },
        { from: ['res/img/favicon.png'], to: ['dist/res/img'] },
        { from: ['docs-user/**/*'], to: ['dist/docs'] },
        { from: ['locales/**/*'], to: ['dist/locales'] },
        {
          from: ['node_modules/source-map/lib/mappings.wasm'],
          to: ['dist'],
        },
      ],
    }),
    generateHtmlPlugin({
      filename: 'index.html',
      entryPoint: 'src/index.tsx',
      templateHTML,
    }),
  ],
};

// Web Worker bundle configuration.
//
// Each worker is built as a standalone IIFE, so that its dependencies end up in a
// single file that can be loaded as a Web Worker without needing ES module
// support. In production the output filename includes a content hash (e.g.
// source-map.worker-ABCD1234.js), and the path is then injected into the main
// bundle via a define. In dev there is no hash, since the dev server always serves
// fresh content and the define can't be updated mid-watch.
function workerConfig(entryPoint, plugins = []) {
  return {
    ...baseConfig,
    entryPoints: [entryPoint],
    outdir: 'dist',
    format: 'iife',
    platform: 'browser',
    target: browserslistToEsbuild(),
    sourcemap: true,
    splitting: false,
    entryNames: isProduction ? '[name]-[hash]' : '[name]',
    metafile: true,
    plugins,
  };
}

// Source map symbolication: needs the wasm loader for the `source-map` package's
// mappings.wasm.
export const sourceMapWorkerConfig = workerConfig(
  'src/profile-logic/source-map.worker.ts',
  [wasmLoader()]
);

// The benchmark comparison's bucket tables. Nothing but the comparison's own
// arithmetic, so no plugins and a very small bundle.
export const benchmarkCompareWorkerConfig = workerConfig(
  'src/profile-logic/benchmark/benchmark-compare.worker.ts'
);

/** The URL to load a worker built with `workerConfig` from, read out of the
 * build's metafile since in production the filename carries a content hash. */
export function getWorkerPath(config, metafile) {
  const [entryPoint] = config.entryPoints;
  const [outputPath] = Object.entries(metafile.outputs).find(
    ([, output]) => output.entryPoint === entryPoint
  );
  return '/' + path.basename(outputPath);
}

// Photon styling build configuration
const photonTemplateHTML = fs.readFileSync(
  path.join(projectRoot, 'res', 'photon', 'index.html'),
  'utf8'
);

export const photonConfig = {
  ...baseConfig,
  format: 'esm',
  platform: 'browser',
  target: browserslistToEsbuild(),
  sourcemap: true,
  publicPath: '/photon/',
  entryPoints: ['res/photon/index.js'],
  outdir: 'dist/photon',
  metafile: true,
  plugins: [
    generateHtmlPlugin({
      filename: 'index.html',
      entryPoint: 'res/photon/index.js',
      templateHTML: photonTemplateHTML,
    }),
  ],
};
