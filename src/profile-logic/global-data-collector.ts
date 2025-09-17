/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { StringTable } from '../utils/string-table';
import type {
  Lib,
  LibMapping,
  IndexIntoLibs,
  RawProfileSharedData,
} from 'firefox-profiler/types';

/**
 * GlobalDataCollector collects data which is global in the processed profile
 * format but per-process or per-thread in the Gecko profile format. It
 * de-duplicates elements and builds one shared list of each type.
 * For now it only de-duplicates libraries, but in the future we may move more
 * tables to be global.
 * You could also call this class an "interner".
 */
export class GlobalDataCollector {
  _libs: Lib[] = [];
  _libKeyToLibIndex: Map<string, IndexIntoLibs> = new Map();
  _stringArray: string[] = [];
  _stringTable: StringTable = StringTable.withBackingArray(this._stringArray);

  // Return the global index for this library, adding it to the global list if
  // necessary.
  indexForLib(libMapping: LibMapping | Lib): IndexIntoLibs {
    const { debugName, breakpadId } = libMapping;
    const libKey = `${debugName}/${breakpadId}`;
    let index = this._libKeyToLibIndex.get(libKey);
    if (index === undefined) {
      index = this._libs.length;
      const { arch, name, path, debugPath, codeId } = libMapping;
      this._libs.push({
        arch,
        name,
        path,
        debugName,
        debugPath,
        breakpadId,
        codeId: codeId ?? null,
      });
      this._libKeyToLibIndex.set(libKey, index);
    }
    return index;
  }

  getStringTable(): StringTable {
    return this._stringTable;
  }

  // Package up all de-duplicated global tables so that they can be embedded in
  // the profile.
  finish(): { libs: Lib[]; shared: RawProfileSharedData } {
    const shared: RawProfileSharedData = {
      stringArray: this._stringArray,
    };

    return { libs: this._libs, shared };
  }
}
