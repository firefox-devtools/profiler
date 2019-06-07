/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

//types
import type { Profile } from '../../../types/profile';

//utils
import { getEmptyProfile } from '../../../profile-logic/data-structures';
import BinaryPlistParser from './BinaryPlistParser';

// TODO make helpers.js and move the appropriate helper functions into it
// TODO add the missing return types in the functions

function parseBinaryPlist(bytes) {
  // console.log('bytes inside parseBinaryPlist function', bytes);
  const text = 'bplist00';
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== text.charCodeAt(i)) {
      throw new Error('File is not a binary plist');
    }
  }

  // console.log(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));

  return new BinaryPlistParser(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  ).parseRoot();
}

function readInstrumentsArchive(buffer) {
  const byteArray = new Uint8Array(buffer);
  // console.log('byteArray', byteArray);
  const parsedPlist = parseBinaryPlist(byteArray);

  console.log('parsedList', parsedPlist);
  return {};
}

async function readFormTemplateFile(tree, fileReader) {
  //console.log('inside readFormTemplateFile', tree);
  const formTemplate = tree.files.get('form.template'); // TODO check for empty formTemplate

  //console.log(await fileReader(formTemplate).asArrayBuffer());
  const archive = readInstrumentsArchive(
    await fileReader(formTemplate).asArrayBuffer()
  );

  // console.log(archive);

  return {};
}

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

export async function convertInstrumentsProfile(
  entry: mixed,
  fileReader
): Profile {
  // We have kept return type as undefined as of now, we will update it once we implement the other functions
  //console.log('inside convertInstrumentsProfile!!!!');
  //console.log('entry', entry);
  const tree = await extractDirectoryTree(entry);
  // console.log('tree', tree);

  const {
    version,
    runs,
    instrument,
    selectedRunNumber,
  } = await readFormTemplateFile(tree, fileReader);

  const profile = getEmptyProfile();

  return profile;
}
