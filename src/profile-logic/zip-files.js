/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { ensureIsValidTabSlug, objectEntries } from '../utils/flow';
import type JSZip, { JSZipFile } from 'jszip';
export type IndexIntoZipFileTable = number;

/**
 * The zip file table takes the files data structure of {[filePath]: fileContents} and
 * maps it into a hierarchical table that can be used by the TreeView component to
 * generate a file tree.
 */
export type ZipFileTable = {
  prefix: Array<IndexIntoZipFileTable | null>,
  path: string[], // e.g. "profile_tresize/tresize/cycle_0.profile"
  partName: string[], // e.g. "cycle_0.profile" or "tresize"
  file: Array<JSZipFile | null>,
  depth: number[],
  length: number,
};

export type ZipDisplayData = {
  +name: string,
  +url: null | string,
  +zipTableIndex: IndexIntoZipFileTable,
};

export function createZipTable(zipEntries: JSZip): ZipFileTable {
  const fullPaths = objectEntries(zipEntries.files)
    .filter(([_fileName, file]) => !file.dir)
    .map(([fileName, _file]) => fileName);

  const pathToFilesTableIndex: Map<string, IndexIntoZipFileTable> = new Map();
  const filesTable: ZipFileTable = {
    prefix: [],
    path: [],
    partName: [],
    file: [],
    depth: [],
    length: 0,
  };

  for (const fullPath of fullPaths) {
    // fullPath: 'profile_tresize/tresize/cycle_0.profile'
    const pathParts = fullPath
      .split('/')
      // Prevent any empty strings from double // or trailing slashes.
      .filter((part) => part);
    // pathParts: ['profile_tresize', 'tresize', 'cycle_0.profile']

    let path = '';
    let prefixIndex = null;
    for (let i = 0; i < pathParts.length; i++) {
      // Go through each path part to assemble the table
      const pathPart = pathParts[i];

      // Add the path part to the path.
      if (path) {
        path += '/' + pathPart;
      } else {
        path = pathPart;
      }

      // This part of the path may already exist.
      const existingIndex = pathToFilesTableIndex.get(path);
      if (existingIndex !== undefined) {
        // This folder was already added, so skip it, but remember the prefix.
        prefixIndex = existingIndex;
        continue;
      }

      const index = filesTable.length++;
      filesTable.prefix[index] = prefixIndex;
      filesTable.path[index] = path;
      filesTable.partName[index] = pathPart;
      filesTable.depth[index] = i;
      filesTable.file[index] =
        i + 1 === pathParts.length ? zipEntries.files[fullPath] : null;
      pathToFilesTableIndex.set(path, index);
      // Remember this index as the prefix.
      prefixIndex = index;
    }
  }
  return filesTable;
}

export function getZipFileMaxDepth(zipFileTable: ZipFileTable | null): number {
  if (!zipFileTable) {
    return 0;
  }
  let maxDepth = 0;
  for (let i = 0; i < zipFileTable.length; i++) {
    maxDepth = Math.max(maxDepth, zipFileTable.depth[i]);
  }
  return maxDepth;
}

export class ZipFileTree {
  _zipFileTable: ZipFileTable;
  _parentToChildren: Map<IndexIntoZipFileTable | null, IndexIntoZipFileTable[]>;
  _displayDataByIndex: Map<IndexIntoZipFileTable, ZipDisplayData>;
  _zipFileUrl: string;

  constructor(zipFileTable: ZipFileTable, zipFileUrl: string) {
    this._zipFileTable = zipFileTable;
    this._zipFileUrl = zipFileUrl;
    this._displayDataByIndex = new Map();
    this._parentToChildren = new Map();

    // null IndexIntoZipFileTable have no children
    this._parentToChildren.set(null, this._computeChildrenArray(null));
  }

  getRoots(): IndexIntoZipFileTable[] {
    return this.getChildren(null);
  }

  getChildren(
    zipTableIndex: IndexIntoZipFileTable | null
  ): IndexIntoZipFileTable[] {
    let children = this._parentToChildren.get(zipTableIndex);
    if (!children) {
      children = this._computeChildrenArray(zipTableIndex);
      this._parentToChildren.set(zipTableIndex, children);
    }
    return children;
  }

  _computeChildrenArray(
    parentIndex: IndexIntoZipFileTable | null
  ): IndexIntoZipFileTable[] {
    const children = [];
    for (
      let childIndex = 0;
      childIndex < this._zipFileTable.length;
      childIndex++
    ) {
      if (this._zipFileTable.prefix[childIndex] === parentIndex) {
        children.push(childIndex);
      }
    }
    return children;
  }

  hasChildren(zipTableIndex: IndexIntoZipFileTable): boolean {
    return this.getChildren(zipTableIndex).length > 0;
  }

  getAllDescendants(
    zipTableIndex: IndexIntoZipFileTable | null
  ): Set<IndexIntoZipFileTable> {
    if (zipTableIndex === null) {
      // Return all the indexes
      return new Set(
        Array.from({ length: this._zipFileTable.length }, (_, i) => i)
      );
    }
    const result = new Set();
    for (const child of this.getChildren(zipTableIndex)) {
      result.add(child);
      for (const descendant of this.getAllDescendants(child)) {
        result.add(descendant);
      }
    }
    return result;
  }

  getParent(zipTableIndex: IndexIntoZipFileTable): IndexIntoZipFileTable {
    const prefix = this._zipFileTable.prefix[zipTableIndex];
    // This returns -1 to support the CallTree interface.
    return prefix === null ? -1 : prefix;
  }

  getDepth(zipTableIndex: IndexIntoZipFileTable): number {
    return this._zipFileTable.depth[zipTableIndex];
  }

  getDisplayData(zipTableIndex: IndexIntoZipFileTable): ZipDisplayData {
    let displayData = this._displayDataByIndex.get(zipTableIndex);
    if (displayData === undefined) {
      let url = null;

      // Build up a URL for the profile.
      if (!this.hasChildren(zipTableIndex)) {
        url =
          window.location.origin +
          '/from-url/' +
          encodeURIComponent(this._zipFileUrl) +
          '/' +
          // Type check the slug:
          ensureIsValidTabSlug('calltree') +
          '/?file=' +
          encodeURIComponent(this._zipFileTable.path[zipTableIndex]);
      }

      let name = this._zipFileTable.partName[zipTableIndex];
      const EXTENSIONS_TO_OMIT = ['.json'];
      const matchedExtension = EXTENSIONS_TO_OMIT.find((extension) =>
        name.endsWith(extension)
      );
      if (matchedExtension) {
        name = name.slice(0, name.length - matchedExtension.length);
      }

      displayData = {
        name,
        url,
        zipTableIndex,
      };
      this._displayDataByIndex.set(zipTableIndex, displayData);
    }
    return displayData;
  }
}

// This function extracts a profile name from the path of a file inside a zip.
export function getProfileNameFromZipPath(path: string): string {
  // This regular expression keeps only the 2 last parts of a path.
  // Here are some examples:
  //   profile1.json -> profile1.json
  //   directory/profile1.json -> directory/profile1.json
  //   very/deep/directory/structure/profile1.json -> structure/profile1.json
  //
  // The logic for this regexp is that we match "not slash characters"
  // between slash characters. Also there may be no directory path so the
  // first element is optional.
  //
  //                           --- a non capturing group
  //                           |  --- several "no slash" characters
  //                           |  |   --- 1 "slash" character
  //                           |  |   |  --- this first group is optional
  //                           |  |   |  | --- several "no slash" characters again
  //                           |  |   |  | |   --- all this at the end of the string
  //                           v  v   v  v v   v
  const directoryAndPathRe = /(?:[^/]+\/)?[^/]+$/;
  const matchResult = directoryAndPathRe.exec(path);
  if (matchResult !== null) {
    return matchResult[0];
  }

  return '';
}
