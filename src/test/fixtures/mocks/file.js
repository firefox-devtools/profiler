/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

type MockFileConfig = {|
  +type: string,
  +payload: any,
|};

/**
 * Bypass all of Flow's checks, and mock out the file interface.
 */
export function mockFile({ type, payload }: MockFileConfig): File {
  const file = {
    type,
    _payload: payload,
  };
  return (file: any);
}

/**
 * Bypass all of Flow's checks, and mock out the file reader.
 */
export function mockFileReader(mockFile: File) {
  const payload = (mockFile: any)._payload;
  return {
    asText: () => Promise.resolve((payload: string)),
    asArrayBuffer: () => Promise.resolve((payload: ArrayBuffer)),
  };
}
