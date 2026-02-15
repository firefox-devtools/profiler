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
    '.svg': 'file',
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
      ],
    }),
    generateHtmlPlugin({
      filename: 'index.html',
      entryPoint: 'src/index.tsx',
      templateHTML,
    }),
  ],
};

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
