/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// A path object which allows easy access to sub-paths at each depth.
// Depth 0 is just the filename, depth 1 is filename + immediate parent
// directory, etc.
class Path {
  // The full path.
  _path: string;

  // Start offsets in the string for each depth.
  // At each depth, this._path.slice(this._offsets[depth]) is the sub-path
  // for that depth. The last offset is zero, because the sub-path at the
  // maximum depth is the entire path.
  _offsets: number[];

  constructor(path: string) {
    const components = path.split(/[/\\]/);

    const offsets = [];
    let curOffset = path.length;
    for (let i = components.length - 1; i >= 0; i--) {
      curOffset -= components[i].length;
      offsets.push(curOffset);
      curOffset -= 1; // for the slash or backslash
    }

    this._path = path;
    this._offsets = offsets;
  }

  maxDepth(): number {
    return this._offsets.length - 1;
  }

  subPathAtDepth(depth: number): string {
    if (depth >= this._offsets.length) {
      return this._path;
    }

    return this._path.slice(this._offsets[depth]);
  }

  fullPath(): string {
    return this._path;
  }
}

// For a list of path strings, compute the shortest sub-paths while keeping
// the paths unique.
// This is used for tab titles when multiple files are open in tabs. The
// tabs should ideally only show the filename, but they may need to show
// additional folders if two files with the same name exist in different
// folders.
//
// Both forward slashes and backslashes are supported as path separators.
// Examples:
// ["a/b/hello.cpp", "c/d/world.h"] -> ["hello.cpp", "world.h"]
// ["a/b/mod.rs", "c/d/mod.rs"] -> ["b/mod.rs", "d/mod.rs"]
// ["a\\b/index.js", "c/b\\index.js"] -> ["b/index.js", "b\\index.js"]
export function computeMinimalUniquePathTails(pathStrings: string[]): string[] {
  const paths = pathStrings.map(path => new Path(path));

  // Contains any sub-paths which have already been encountered by paths
  // which the loop has already seen, and which therefore are not unique.
  const collisions = new Set();

  // Contains subPath -> index entries which are unique among the paths seen
  // so far in the loop. The index points into pathStrings / paths / subPaths
  // (those three arrays all have the same order) and allows modifying subPaths
  // as needed.
  const uniqueSubPaths = new Map();

  // The array in which the return value is built up. Same order as paths and
  // pathStrings. Elements in subPaths are unique among the paths seen so far
  // in the loop (except for paths which can't be unique because even their
  // full path collides with something). As the loop encounters new paths,
  // existing sub-paths in this array can be modified to resolve collisions.
  const subPaths = [];

  // Loop through all paths. For each path, resolve any collisions with an
  // existing sub-path, and then store the unique sub-path for this path in the
  // subPaths array. "Resolving collisions" means that any existing path whose
  // so-far-unique sub-path collides with the new path will need to be adjusted
  // to a deeper depth, so that its updated unique sub-path does not collide with
  // the new path.
  //
  // Example:
  // input:    ["symbols/lib/mod.rs", "tabs/render/mod.rs", "flames/lib/mod.rs"]
  // subPaths: ["mod.rs"]
  // subPaths: ["lib/mod.rs",         "render/mod.rs"]
  // subPaths: ["symbols/lib/mod.rs", "render/mod.rs",      "flames/lib/mod.rs"]
  //
  // The central insight here is the following: Each new path can only collide
  // with *one* existing sub-path in such a way that that existing path will need
  // updating. That's because the existing sub-paths are already unique (so far).
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    let depth = 0;
    while (depth <= path.maxDepth()) {
      if (!collisions.has(path.subPathAtDepth(depth))) {
        break;
      }
      depth++;
    }

    if (depth > path.maxDepth()) {
      // Collided all the way to the full path.
      subPaths.push(path.fullPath());
      continue;
    }

    let subPath = path.subPathAtDepth(depth);
    const collidedIndex = uniqueSubPaths.get(subPath);
    if (collidedIndex === undefined) {
      // No collision at this depth. This is the sub-path we will use.
      uniqueSubPaths.set(subPath, i);
      subPaths.push(subPath);
      continue;
    }

    // We collided on subPath. This is the first collision on subPath.
    collisions.add(subPath);
    uniqueSubPaths.delete(subPath);

    // We know that collidedIndex < i.
    const collidedPath = paths[collidedIndex];

    // We need to go at least 1 level deeper to make the subPaths different.
    depth++;

    // Increase the depth until the sub-paths are different.
    while (depth <= Math.min(path.maxDepth(), collidedPath.maxDepth()) + 1) {
      if (path.subPathAtDepth(depth) !== collidedPath.subPathAtDepth(depth)) {
        break;
      }
      collisions.add(path.subPathAtDepth(depth));
      depth++;
    }

    // Fix up the existing path.
    const collidedSubPath = collidedPath.subPathAtDepth(depth);
    subPaths[collidedIndex] = collidedSubPath;

    subPath = path.subPathAtDepth(depth);
    if (subPath !== collidedSubPath) {
      // The paths are now different at this depth. Mark these unique paths
      // in the uniqueSubPaths map.
      uniqueSubPaths.set(collidedSubPath, collidedIndex);
      uniqueSubPaths.set(subPath, i);
    } else {
      // The full paths must be identical.
      // Don't add any entries to uniqueSubPaths because the sub-paths aren't
      // unique, and they've already been added to the collisions set.
    }

    subPaths.push(subPath);
  }

  return subPaths;
}
