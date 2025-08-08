/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This worker is imported as WebWorker since it's conflicting with the Worker
// global type.
import WebWorker from './worker-factory';

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
export function compress(
  data: string | Uint8Array,
  compressionLevel?: number
): Promise<Uint8Array<ArrayBuffer>> {
  const zeeWorker = new WebWorker('zee-worker') as Worker;
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
export function decompress(data: Uint8Array): Promise<Uint8Array> {
  return new Promise(function (resolve, reject) {
    const zeeWorker = new WebWorker('zee-worker') as Worker;
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
