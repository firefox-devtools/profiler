/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 // @flow
import Worker from './worker-factory';

const zeeWorker = new Worker('zee-worker');
const zeeCallbacks = [];

zeeWorker.onmessage = function(msg) {
  zeeCallbacks[msg.data.callbackID][msg.data.type](msg.data.data);
  zeeCallbacks[msg.data.callbackID] = null;
};

// Neuters data's buffer, if data is a typed array.
export function compress(data, compressionLevel) {
  const arrayData =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return new Promise(function(resolve, reject) {
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
export function decompress(data) {
  return new Promise(function(resolve, reject) {
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
