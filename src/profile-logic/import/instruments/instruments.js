/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

export function isInstrumentsProfile(file: mixed): boolean {
  let fileName = '';
  if (
    // Check that file is not `null` or `undefined`
    file &&
    // Check that file is an object.
    typeof file === 'object' &&
    // Check that the property name is a string
    typeof file.name === 'string'
  ) {
    fileName = file.name;
  }

  const fileMetaData = fileName.split('.');
  if (
    fileMetaData.length === 1 ||
    (fileMetaData[0] === '' && fileMetaData.length === 2)
  ) {
    return false;
  }
  return fileMetaData.pop() === 'trace';
}

export function convertInstrumentsProfile(
  profileData: mixed
): typeof undefined {
  // We have kept return type as undefined as of now, we will update it once we implement the other functions
  console.log(profileData);
}
