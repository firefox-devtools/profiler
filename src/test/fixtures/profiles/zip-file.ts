/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import { serializeProfile } from '../../../profile-logic/process-profile';
import { receiveZipFile } from '../../../actions/receive-profile';
import { setDataSource } from '../../../actions/profile-view';
import type {
  IndexIntoZipFileTable,
  ZipFileTable,
} from '../../../profile-logic/zip-files';
import createStore from '../../../app-logic/create-store';
import JSZip from 'jszip';

/**
 * Puts a blank profile at each given path in a zip file.
 */
export function getZippedProfiles(files: string[] = []): JSZip {
  const { profile } = getProfileFromTextSamples('A');
  const profileText = serializeProfile(profile);

  const zip = new JSZip();
  files.forEach((fileName) => {
    zip.file(fileName, profileText);
  });

  for (const file of Object.values(zip.files)) {
    // The date for files, and directories defaults to the current time,
    // which breaks snapshot tests.
    file.date = new Date('1997-08-29T05:14:14.617Z');
  }

  return zip;
}

/**
 * Creates a store with a zip file given using `getZippedProfiles`.
 */
export async function storeWithZipFile(files: string[] = []) {
  const store = createStore();
  const zippedProfiles = getZippedProfiles(files);
  store.dispatch(setDataSource('from-file'));
  store.dispatch(receiveZipFile(zippedProfiles));
  return {
    store,
    dispatch: store.dispatch,
    getState: store.getState,
    zippedProfiles,
  };
}

/**
 * Transform the zip file data structure into a human readable string to easily
 * assert the tree structure of the table.
 */
export function formatZipFileTable(zipFileTable: ZipFileTable): string[] {
  if (!zipFileTable) {
    return [];
  }
  // Remember a computed depth, given an index.
  const indexToDepth = new Map<IndexIntoZipFileTable | null, number>();
  // If no prefix, start at -1, so that the next depth gets computed to 0.
  indexToDepth.set(null, -1);
  const result = [];
  for (let i = 0; i < zipFileTable.length; i++) {
    // Pull out the values
    const prefix = zipFileTable.prefix[i];
    const partName = zipFileTable.partName[i];
    const type = zipFileTable.file[i] ? 'file' : 'dir';

    // Compute the depth and whitespace
    const prefixDepth = indexToDepth.get(prefix)!;
    const depth = prefixDepth + 1;
    const whitespace = ''.padStart(depth * 2);

    // Remember the depth.
    indexToDepth.set(i, depth);
    result.push(`${whitespace}${partName} (${type})`);
  }
  return result;
}
