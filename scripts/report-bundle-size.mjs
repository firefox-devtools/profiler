/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Reports the size of the production build. Run `yarn build-prod` first.
//
// Usage: yarn bundle-size [--baseline <file>] [--output <file>]
//
//   --baseline <file>  Sizes written earlier with --output, to compare with.
//   --output <file>    Write the sizes as JSON.
//
// The bundles are listed in bundle-size.config.json. An entry can set a
// "limit" in bytes on its uncompressed size, and the script fails above it.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseArgs, promisify } from 'util';
import zlib from 'zlib';

import {
  getTotal,
  parseBaseline,
  renderReport,
  reportConfig,
} from './lib/bundle-size-report.mjs';
import { mainBundleConfig } from './lib/esbuild-configs.mjs';

const config = {
  ...reportConfig,
  configFile: 'bundle-size.config.json',
  buildDir: mainBundleConfig.outdir,
  // The files of the app inside the build.
  appFiles: ['*.{js,css,html,json,wasm,txt,jpg,png}', 'locales/**', 'res/**'],
  // The formats that servers compress.
  compressible: ['.js', '.css', '.html', '.json', '.wasm', '.ftl', '.txt'],
};

// The hash is the 8 characters before the extension.
const HASH_PATTERN = /-(?:[A-Z0-9]{8}|[a-f0-9]{8})(?=\.[a-z0-9]+$)/;

// Names a file without its hash, or by its folder.
export function getAssetName(pathInBuild) {
  const [first, ...rest] = pathInBuild.split('/');
  return rest.length > 0 ? `${first}/` : first.replace(HASH_PATTERN, '-*');
}

export function groupAssets(files) {
  const assetsByName = files.reduce(
    (assets, { path: file, size, brotliSize }) => {
      const name = getAssetName(file.slice(config.buildDir.length + 1));
      const asset = assets.get(name) ?? {
        name,
        files: 0,
        size: 0,
        brotliSize: 0,
      };
      asset.files += 1;
      asset.size += size;
      asset.brotliSize += brotliSize;
      return assets.set(name, asset);
    },
    new Map()
  );
  return Array.from(assetsByName.values());
}

// Adds up the files matching the pattern of an entry.
export function getEntrySize(pattern, files) {
  return getTotal(
    files.filter((file) => path.posix.matchesGlob(file.path, pattern))
  );
}

// Measures every file once: its size, and its Brotli size.
async function measureFiles(projectRoot) {
  const { appFiles, brotliLevel, compressible } = config;
  const brotliCompress = promisify(zlib.brotliCompress);
  const getBrotliSizeOf = async (file, content) => {
    if (!compressible.includes(path.extname(file))) {
      return content.length;
    }
    const { length } = await brotliCompress(content, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: brotliLevel },
    });
    return length;
  };

  const buildDir = path.join(projectRoot, config.buildDir);
  const isAppFile = (file) => {
    const pathInBuild = path.relative(buildDir, file).split(path.sep).join('/');
    return appFiles.some((pattern) =>
      path.posix.matchesGlob(pathInBuild, pattern)
    );
  };

  return Promise.all(
    fs
      .readdirSync(buildDir, { recursive: true, withFileTypes: true })
      .reduce((measures, entry) => {
        const file = path.join(entry.parentPath, entry.name);
        if (!entry.isFile() || !isAppFile(file)) {
          return measures;
        }
        const content = fs.readFileSync(file);
        measures.push(
          getBrotliSizeOf(file, content).then((brotliSize) => ({
            path: path.relative(projectRoot, file).split(path.sep).join('/'),
            size: content.length,
            brotliSize,
          }))
        );
        return measures;
      }, [])
  );
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A baseline that can't be read is only mentioned.
function readBaseline(baselinePath) {
  if (!baselinePath || !fs.existsSync(baselinePath)) {
    return null;
  }
  const baseline = parseBaseline(
    parseJSON(fs.readFileSync(baselinePath, 'utf8'))
  );
  if (!baseline) {
    console.warn(
      `The baseline in ${baselinePath} couldn't be read, so the sizes are reported without their changes.`
    );
  }
  return baseline;
}

// Reads the entries of bundle-size.config.json.
function readEntries(projectRoot) {
  const entries = JSON.parse(
    fs.readFileSync(path.join(projectRoot, config.configFile), 'utf8')
  );
  const isValid = (entry) =>
    typeof entry?.name === 'string' &&
    typeof entry.path === 'string' &&
    (entry.limit === undefined || typeof entry.limit === 'number');
  const invalidEntry = entries.find((entry) => !isValid(entry));
  if (invalidEntry) {
    throw new Error(
      `Each entry of ${config.configFile} needs a "name" and a "path", and its "limit" is a number of bytes. Please have a look at: ${JSON.stringify(invalidEntry)}`
    );
  }
  if (!entries.every((entry) => entry.path.startsWith(`${config.buildDir}/`))) {
    throw new Error(
      `The build goes to "${config.buildDir}/", which is where the paths of ${config.configFile} need to start.`
    );
  }
  if (!entries.some(({ name }) => name === config.costEstimate.bundle)) {
    throw new Error(
      `The cost estimate is for "${config.costEstimate.bundle}", which needs an entry with this name in ${config.configFile}.`
    );
  }
  return entries;
}

async function main() {
  const {
    values: { baseline: baselinePath, output: outputPath },
  } = parseArgs({
    options: {
      baseline: { type: 'string' },
      output: { type: 'string' },
    },
  });

  const projectRoot = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  const configuredEntries = readEntries(projectRoot);
  if (!fs.existsSync(path.join(projectRoot, config.buildDir))) {
    console.error(
      `There is no "${config.buildDir}/" to measure. Please run \`yarn build-prod\` first.`
    );
    process.exit(1);
  }
  const files = await measureFiles(projectRoot);
  const entries = configuredEntries.map(({ name, path: pattern, limit }) => {
    const { size, brotliSize } = getEntrySize(pattern, files);
    return {
      name,
      size,
      brotliSize,
      ...(limit !== undefined && { sizeLimit: limit, passed: size <= limit }),
    };
  });

  const emptyNames = entries.reduce((names, { name, size }) => {
    if (!size) {
      names.push(name);
    }
    return names;
  }, []);
  if (emptyNames.length > 0) {
    console.error(
      `No files found for: ${emptyNames.join(', ')}. Please run \`yarn build-prod\` first. If the build output has moved, the paths in ${config.configFile} are the place to follow it.`
    );
    process.exit(1);
  }
  const assets = groupAssets(files);

  const report = renderReport(entries, readBaseline(baselinePath), assets, {
    isBaselineExpected: Boolean(baselinePath),
  });
  process.stdout.write(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }

  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(
      outputPath,
      JSON.stringify({ commit: process.env.GITHUB_SHA, entries, assets }) + '\n'
    );
  }

  const namesOverLimit = entries.reduce((names, { name, passed }) => {
    if (passed === false) {
      names.push(name);
    }
    return names;
  }, []);
  if (namesOverLimit.length > 0) {
    console.error(
      `\nNow over the limit: ${namesOverLimit.join(', ')}. In the case of an intentional trade-off, the limit can be raised in ${config.configFile}.`
    );
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
