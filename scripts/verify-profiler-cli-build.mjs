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

if (!existsSync(distUrl)) {
  console.error(
    `profiler-cli bundle not found at ${distPath}.\n` +
      `Run 'yarn build-profiler-cli' from the repo root before publishing.`
  );
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(pkgUrl, 'utf8'));
const bundle = readFileSync(distUrl, 'utf8');
const needle = JSON.stringify(version);

if (!bundle.includes(needle)) {
  console.error(
    `profiler-cli bundle does not embed the current package.json version (${version}).\n` +
      `The bundle is stale — rebuild with 'yarn build-profiler-cli' from the repo root.`
  );
  process.exit(1);
}

console.log(`✅ profiler-cli build verified (version ${version})`);
