/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import zeeWorkerPath from 'firefox-profiler-res/zee-worker.js';

const zeeCallbacks: Array<{
  success: (data: any) => void;
  error: (error: any) => void;
} | null> = [];

type ZeeWorkerData = {
  callbackID: number;
  type: 'success' | 'error';
  data: any;
};

function workerOnMessage(zeeWorker: Worker) {
  zeeWorker.onmessage = function (msg: MessageEvent) {
    const data = msg.data as ZeeWorkerData;
    const callbacks = zeeCallbacks[data.callbackID];
    if (callbacks) {
      callbacks[data.type](data.data);
      zeeCallbacks[data.callbackID] = null;
    }
  };
}

// Neuters data's buffer, if data is a typed array.
export async function compress(
  data: string | Uint8Array,
  compressionLevel?: number
): Promise<Uint8Array<ArrayBuffer>> {
  if (!(typeof window === 'object' && 'Worker' in window)) {
    // Try to fall back to Node's zlib library.
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (errorOrNull, result) => {
        if (errorOrNull) {
          reject(errorOrNull);
        } else {
          resolve(new Uint8Array(result.buffer as ArrayBuffer));
        }
      });
    });
  }

  const zeeWorker = new Worker(zeeWorkerPath);
  workerOnMessage(zeeWorker);

  const arrayData =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return new Promise(function (resolve, reject) {
    zeeWorker.postMessage(
      {
        request: 'compress',
        data: arrayData,
        compressionLevel: compressionLevel,
        callbackID: zeeCallbacks.length,
      },
      [arrayData.buffer]
    );
    zeeCallbacks.push({
      success: resolve,
      error: reject,
    });
  });
}

// Neuters data's buffer, if data is a typed array.
export async function decompress(data: Uint8Array): Promise<Uint8Array> {
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
          resolve(new Uint8Array(result.buffer as ArrayBuffer));
        }
      });
    });
  }

  const zeeWorker = new Worker(zeeWorkerPath);
  return new Promise(function (resolve, reject) {
    workerOnMessage(zeeWorker);
    zeeWorker.postMessage(
      {
        request: 'decompress',
        data: data,
        callbackID: zeeCallbacks.length,
      },
      [data.buffer]
    );
    zeeCallbacks.push({
      success: resolve,
      error: reject,
    });
  });
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
