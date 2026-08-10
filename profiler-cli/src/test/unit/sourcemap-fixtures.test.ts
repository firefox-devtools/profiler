/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Validates the `sourcemap` integration fixture generator, and regenerates the
 * committed fixtures when `REGEN_SOURCEMAP_FIXTURES=1`.
 *
 * This runs in the browser (jsdom) project because the profile builders it
 * imports are DOM-coupled; the node-env integration tests can only consume the
 * committed output, not build it. To regenerate:
 *
 *   REGEN_SOURCEMAP_FIXTURES=1 JEST_PROJECTS=cli yarn jest sourcemap-fixtures
 */

import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { generateSourcemapFixtures } from '../fixtures/sourcemap-generator';

const COMMITTED_DIR = join(__dirname, '..', 'fixtures', 'sourcemap');

describe('sourcemap fixture generator', () => {
  it('produces loadable profiles and source maps', () => {
    const outDir = process.env.REGEN_SOURCEMAP_FIXTURES
      ? COMMITTED_DIR
      : mkdtempSync(join(tmpdir(), 'sourcemap-fixtures-'));

    generateSourcemapFixtures(outDir);

    const single = JSON.parse(
      readFileSync(join(outDir, 'single.json'), 'utf8')
    );
    expect(single.meta).toBeDefined();
    expect(single.shared.sources).toBeDefined();

    const map = JSON.parse(readFileSync(join(outDir, 'bundle.js.map'), 'utf8'));
    expect(map.version).toBe(3);
    expect(map.mappings).toEqual(expect.any(String));
  });
});
