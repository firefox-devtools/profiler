/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import JSZip, { type JSZipFile } from 'jszip';

export type IndexIntoZipFileTable = number;

/**
 * The zip file table takes the files data structure of {[filePath]: fileContents} and
 * maps it into a hierarchical table that can be used by the TreeView component to
 * generate a file tree.
 */
export type ZipFileTable = {|
  prefix: Array<IndexIntoZipFileTable | null>,
  path: string[], // e.g. "profile_tresize/tresize/cycle_0.profile"
  partName: string[], // e.g. "cycle_0.profile" or "tresize"
  file: Array<JSZipFile | null>,
  depth: number[],
  length: number,
|};

export function createZipTable(zipEntries: JSZip): ZipFileTable {
  const fullPaths = [];
  for (const fileName in zipEntries.files) {
    if (zipEntries.files.hasOwnProperty(fileName)) {
      const file = zipEntries.files[fileName];
      if (!file.dir) {
        fullPaths.push(fileName);
      }
    }
  }
  const pathToFilesTableIndex: Map<string, IndexIntoZipFileTable> = new Map();
  const filesTable: ZipFileTable = {
    prefix: [],
    path: [],
    partName: [],
    file: [],
    depth: [],
    length: 0,
  };

  for (let i = 0; i < fullPaths.length; i++) {
    // e.g.: 'profile_tresize/tresize/cycle_0.profile'
    const fullPath = fullPaths[i];
    // e.g.: ['profile_tresize', 'tresize', 'cycle_0.profile']
    const pathParts = fullPath.split('/').filter(part => part);

    let path = '';
    let prefixIndex = null;
    for (let j = 0; j < pathParts.length; j++) {
      // Go through each path part to assemble the table
      const pathPart = pathParts[j];

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
      filesTable.depth[index] = j;
      filesTable.file[index] =
        j + 1 === pathParts.length ? zipEntries.files[fullPath] : null;
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

type ZipDisplayData = {|
  name: string,
|};

export class ZipFileTree {
  _zipFileTable: ZipFileTable;
  _parentToChildren: null | Map<
    IndexIntoZipFileTable | null,
    IndexIntoZipFileTable[]
  >;
  _displayDataByIndex: Map<IndexIntoZipFileTable, ZipDisplayData>;

  constructor(zipFileTable: ZipFileTable) {
    this._zipFileTable = zipFileTable;
    this._displayDataByIndex = new Map();
  }

  getRoots(): IndexIntoZipFileTable[] {
    return this.getChildren(null);
  }

  getChildren(
    zipTableIndex: IndexIntoZipFileTable | null
  ): IndexIntoZipFileTable[] {
    const parentToChildMap = this._getParentToChildMap();
    const children = parentToChildMap.get(zipTableIndex);
    if (!children) {
      throw new Error(
        'Attempted to fetch the children from an unknown IndexIntoZipFileTable.'
      );
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

  /**
   * Create a Map of the parents to the children to make it O(1) to dynamically compute
   * any property about the tree.
   */
  _getParentToChildMap(): Map<
    IndexIntoZipFileTable | null,
    IndexIntoZipFileTable[]
  > {
    let parentToChildren = this._parentToChildren;
    if (!parentToChildren) {
      parentToChildren = new Map();
      parentToChildren.set(null, this._computeChildrenArray(null));

      for (
        let parentIndex = 0;
        parentIndex < this._zipFileTable.length;
        parentIndex++
      ) {
        const children = this._computeChildrenArray(parentIndex);
        parentToChildren.set(parentIndex, children);
      }
    }
    return parentToChildren;
  }

  hasChildren(zipTableIndex: IndexIntoZipFileTable): boolean {
    return this.getChildren(zipTableIndex).length > 0;
  }

  getAllDescendants(
    zipTableIndex: IndexIntoZipFileTable
  ): Set<IndexIntoZipFileTable> {
    const result = new Set([]);
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

  hasSameNodeIds(tree: ZipFileTree) {
    return this._zipFileTable === tree._zipFileTable;
  }

  getDisplayData(zipTableIndex: IndexIntoZipFileTable): ZipDisplayData {
    let displayData = this._displayDataByIndex.get(zipTableIndex);
    if (displayData === undefined) {
      displayData = {
        name: this._zipFileTable.partName[zipTableIndex],
      };
      this._displayDataByIndex.set(zipTableIndex, displayData);
    }
    return displayData;
  }
}

/**
 * Try and display a nice amount of files in a zip file initially for a user. The amount
 * is an arbitrary choice really.
 */
export function procureInitialInterestingExpandedNodes(
  zipFileTree: ZipFileTree,
  maxExpandedNodes: number = 30
) {
  const roots = zipFileTree.getRoots();

  // Get a list of all of the root node's children.
  const children = [];
  for (const index of roots) {
    for (const childIndex of zipFileTree.getChildren(index)) {
      children.push(childIndex);
    }
  }

  // Try to expand as many of these as needed to show more expanded nodes.
  let nodeCount = roots.length + children.length;
  const expansions = [...roots];
  for (const childIndex of children) {
    if (nodeCount >= maxExpandedNodes) {
      break;
    }
    const subChildren = zipFileTree.getChildren(childIndex);
    if (subChildren.length > 0) {
      expansions.push(childIndex);
      nodeCount += subChildren.length;
    }
  }

  return expansions;
}
