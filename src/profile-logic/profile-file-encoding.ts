/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  optimizeProfileForStorage,
  serializeProfileToJsonSlabsFile,
  serializeProfileToJsonString,
} from './process-profile';
import { compress } from 'firefox-profiler/utils/gz';
import type { Profile } from 'firefox-profiler/types';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

/**
 * On-disk encodings for a processed profile, chosen from the file extension.
 */
export type ProfileFileFormat = 'json' | 'json-gz' | 'jslb' | 'jslb-gz';

export function profileFileFormatFromFilename(
  filename: string
): ProfileFileFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.jslb.gz')) {
    return 'jslb-gz';
  }
  if (lower.endsWith('.jslb')) {
    return 'jslb';
  }
  if (lower.endsWith('.gz')) {
    return 'json-gz';
  }
  return 'json';
}

/**
 * Encode a processed profile the way the given filename's extension asks for.
 * JSON slabs output goes through `optimizeProfileForStorage` first so its large
 * columns are stored as binary slabs.
 */
export async function encodeProfileForFilename(
  profile: Profile,
  filename: string
): Promise<{ bytes: Uint8Array; format: ProfileFileFormat }> {
  const format = profileFileFormatFromFilename(filename);
  switch (format) {
    case 'json':
      return {
        bytes: new TextEncoder().encode(serializeProfileToJsonString(profile)),
        format,
      };
    case 'json-gz':
      return {
        bytes: await compress(serializeProfileToJsonString(profile)),
        format,
      };
    case 'jslb':
      return {
        bytes: serializeProfileToJsonSlabsFile(
          optimizeProfileForStorage(profile)
        ),
        format,
      };
    case 'jslb-gz':
      return {
        bytes: await compress(
          serializeProfileToJsonSlabsFile(optimizeProfileForStorage(profile))
        ),
        format,
      };
    default:
      throw assertExhaustiveCheck(format);
  }
}
