/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import path from 'path';

export function cleanDist(distDir = 'dist') {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
}

export function saveMetafile(
  buildResult,
  outputPath = 'build-meta/metafile.json'
) {
  // Only save metafile if SAVE_METAFILE=1 is set
  if (!process.env.SAVE_METAFILE) {
    return;
  }

  if (buildResult.metafile) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(buildResult.metafile, null, 2));
    console.log(`📊 Metafile saved to ${outputPath}`);
  }
}
