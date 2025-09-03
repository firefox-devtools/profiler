/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';

export function cleanDist(distDir = 'dist') {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
}

export function saveMetafile(buildResult, outputPath = 'dist/metafile.json') {
  if (buildResult.metafile) {
    fs.writeFileSync(outputPath, JSON.stringify(buildResult.metafile, null, 2));
    console.log(`📊 Metafile saved to ${outputPath}`);
  }
}
