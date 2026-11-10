/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const pkgUrl = new URL('../profiler-cli/package.json', import.meta.url);
const distUrl = new URL(
  '../profiler-cli/dist/profiler-cli.js',
  import.meta.url
);
const distPath = fileURLToPath(distUrl);

// The `source-map` package reads this next to the bundle at runtime, so it is a
// required build artifact, not an optional extra. See scripts/build-profiler-cli.mjs.
const wasmUrl = new URL('../profiler-cli/dist/mappings.wasm', import.meta.url);

if (!existsSync(distUrl)) {
  console.error(
    `profiler-cli bundle not found at ${distPath}.\n` +
      `Run 'yarn build-cli' from the repo root before publishing.`
  );
  process.exit(1);
}

if (!existsSync(wasmUrl)) {
  console.error(
    `profiler-cli source map parser not found at ${fileURLToPath(wasmUrl)}.\n` +
      `Without it, 'sourcemap apply' silently applies nothing.\n` +
      `Run 'yarn build-cli' from the repo root before publishing.`
  );
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));
const bundle = readFileSync(distUrl, 'utf8');
const needle = JSON.stringify(version);

if (!bundle.includes(needle)) {
  console.error(
    `profiler-cli bundle does not embed the current package.json version (${version}).\n` +
      `The bundle is stale — rebuild with 'yarn build-cli' from the repo root.`
  );
  process.exit(1);
}

console.log(`✅ profiler-cli build verified (version ${version})`);
