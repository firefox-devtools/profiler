/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { SourceMapLocation } from './types';

/**
 * Firefox stores an inline map's entire `data:` URL in the source table, so the
 * "URL" can be megabytes of base64. Describe those by media type and size
 * instead, which keeps the payload out of both the text and `--json` output.
 */
export function toSourceMapLocation(sourceMapURL: string): SourceMapLocation {
  if (!sourceMapURL.startsWith('data:')) {
    return { kind: 'url', url: sourceMapURL };
  }
  return {
    kind: 'inline',
    mediaType: sourceMapURL.slice('data:'.length).split(',', 1)[0],
    byteLength: sourceMapURL.length,
  };
}
