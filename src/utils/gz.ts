/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import gzWorkerPath from './gz.worker.js';

function runGzWorker(
  kind: 'compress' | 'decompress',
  arrayData: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    // On-demand spawn the worker. If this is too slow we can look into keeping
    // a pool of workers around.
    const worker = new Worker(gzWorkerPath);

    worker.onmessage = (e) => {
      resolve(e.data as Uint8Array<ArrayBuffer>);
      worker.terminate();
    };

    worker.onerror = (e) => {
      reject(e.error);
      worker.terminate();
    };

    worker.postMessage({ kind, arrayData }, [arrayData.buffer]);
  });
}

// This will transfer `data` if it is an array buffer.
export async function compress(
  data: string | Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  // Encode the data if it's a string
  const arrayData =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;

  if (!(typeof window === 'object' && 'Worker' in window)) {
    // Try to fall back to Node's zlib library.
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (errorOrNull, result) => {
        if (errorOrNull) {
          reject(errorOrNull);
        } else {
          resolve(result);
        }
      });
    });
  }

  return runGzWorker('compress', arrayData);
}

export async function decompress(
  data: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  if (!(typeof window === 'object' && 'Worker' in window)) {
    // Handle the case where we're not running in the browser, e.g. when
    // this code is used as part of a library in a Node project.
    // We don't get here when running Firefox profiler tests, because our
    // tests create a mock window with a mock Worker class.
    // Try to fall back to Node's zlib library.
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (errorOrNull, result) => {
        if (errorOrNull) {
          reject(errorOrNull);
        } else {
          resolve(result);
        }
      });
    });
  }

  return runGzWorker('decompress', data);
}

export function isGzip(data: Uint8Array): boolean {
  // Detect the gzip magic bytes 1f 8b 08.
  return (
    data.byteLength >= 3 &&
    data[0] === 0x1f &&
    data[1] === 0x8b &&
    data[2] === 0x08
  );
}
