/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getEmptyProfile } from '../../../profile-logic/profile-data';
import { serializeProfile } from '../../../profile-logic/process-profile';
import JSZip from 'jszip';

export async function getZippedProfiles(): Promise<JSZip> {
  const profile = serializeProfile(getEmptyProfile());
  const files = [
    'foo/bar/profile1.json',
    'foo/profile2.json',
    'foo/profile3.json',
    'foo/profile4.json',
    'baz/profile5.json',
  ];

  const zip = new JSZip();
  files.forEach(fileName => {
    zip.file(fileName, profile);
  });

  return zip;
  // return zip.generateAsync({ type: 'uint8array' });
}
