/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as path from 'path';
import { pathToFileURL } from 'url';
import { runSourceMapSymbolicationCore } from 'firefox-profiler/profile-logic/source-map-symbolication';

import type {
  WorkerInput,
  WorkerOutput,
} from 'firefox-profiler/profile-logic/source-map-worker-types';
import type { SourceMapLocation } from './types';

const DATA_URL_PREFIX = 'data:';

/**
 * Upper bound on a plausible data: URL media type. Anything longer means the
 * URL is malformed and we are looking at payload, not a media type.
 */
const MAX_MEDIA_TYPE_LENGTH = 100;

/**
 * Firefox stores an inline map's entire `data:` URL in the source table, so the
 * "URL" can be megabytes of base64. Describe those by media type and size
 * instead, which keeps the payload out of both the text and `--json` output.
 *
 * The URL is page-controlled and never validated on the way here (SpiderMonkey
 * stores the `//# sourceMappingURL=` comment verbatim), so a `data:` URL with a
 * missing or absurdly distant comma is possible. Report those without a media
 * type rather than echoing the payload into it.
 */
export function toSourceMapLocation(sourceMapURL: string): SourceMapLocation {
  if (!sourceMapURL.startsWith(DATA_URL_PREFIX)) {
    return { kind: 'url', url: sourceMapURL };
  }
  const commaIndex = sourceMapURL.indexOf(',', DATA_URL_PREFIX.length);
  const mediaTypeLength = commaIndex - DATA_URL_PREFIX.length;
  const hasMediaType =
    commaIndex !== -1 && mediaTypeLength <= MAX_MEDIA_TYPE_LENGTH;
  return {
    kind: 'inline',
    mediaType: hasMediaType
      ? sourceMapURL.slice(DATA_URL_PREFIX.length, commaIndex)
      : null,
    byteLength: sourceMapURL.length,
  };
}

/**
 * Node replacement for the browser's `_runSourceMapWorker`. The daemon has no
 * `Worker`, so it runs the symbolication core directly on the current thread
 * (blocking is fine in a background process).
 *
 * The `source-map` package's Node build reads `lib/mappings.wasm` from
 * `path.join(__dirname, 'mappings.wasm')` and its `initialize` is a no-op, so
 * the `wasmUrl` we pass here is effectively ignored at runtime. We still pass a
 * `__dirname`-relative path: when bundled by esbuild both this module and
 * `source-map`'s reader share the same `__dirname`, and the build step copies
 * `mappings.wasm` next to the bundle (see scripts/build-profiler-cli.mjs).
 */
export async function runSourceMapSymbolicationNode(
  input: WorkerInput
): Promise<WorkerOutput> {
  const wasmUrl = pathToFileURL(path.join(__dirname, 'mappings.wasm')).href;
  return runSourceMapSymbolicationCore(input, wasmUrl);
}
