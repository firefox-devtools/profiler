/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

//types
import type { Profile } from '../../../types/profile';

//utils
import { getEmptyProfile } from '../../../profile-logic/data-structures';

async function extractDirectoryTree(entry) {
  const node = {
    name: entry.name,
    files: new Map(),
    subdirectories: new Map(),
  };

  const children = await new Promise((resolve, reject) => {
    entry.createReader().readEntries((entries: any[]) => {
      resolve(entries);
    }, reject);
  });

  for (const child of children) {
    if (child.isDirectory) {
      const subtree = await extractDirectoryTree(child);
      node.subdirectories.set(subtree.name, subtree);
    } else {
      const file = await new Promise((resolve, reject) => {
        child.file(resolve, reject);
      });
      node.files.set(file.name, file);
    }
  }

  return node;
}

export function isInstrumentsProfile(file: mixed): boolean {
  let fileName = '';
  if (file && typeof file === 'object' && typeof file.name === 'string') {
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

export async function convertInstrumentsProfile(entry: mixed): Profile {
  // We have kept return type as undefined as of now, we will update it once we implement the other functions
  console.log('inside convertInstrumentsProfile!!!!');
  console.log('entry', entry);
  const tree = await extractDirectoryTree(entry);
  console.log('tree', tree);
  const profile = getEmptyProfile();

  return profile;
}
