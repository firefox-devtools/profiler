/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { StringTable } from '../utils/string-table';
import type {
  Lib,
  LibMapping,
  IndexIntoLibs,
  IndexIntoStringTable,
  IndexIntoSourceTable,
  RawProfileSharedData,
  SourceTable,
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
  _sources: SourceTable = { length: 0, uuid: [], filename: [] };
  _uuidToSourceIndex: Map<string, IndexIntoSourceTable> = new Map();
  _filenameToSourceIndex: Map<IndexIntoStringTable, IndexIntoSourceTable> =
    new Map();

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

  // Return the global index for this source, adding it to the global list if
  // necessary.
  indexForSource(uuid: string | null, filename: string): IndexIntoSourceTable {
    let index: IndexIntoSourceTable | undefined;

    if (uuid !== null) {
      index = this._uuidToSourceIndex.get(uuid);
    } else {
      // For null UUIDs, use filename-based lookup
      const filenameIndex = this._stringTable.indexForString(filename);
      index = this._filenameToSourceIndex.get(filenameIndex);
    }

    if (index === undefined) {
      index = this._sources.length;
      const filenameIndex = this._stringTable.indexForString(filename);
      this._sources.uuid[index] = uuid;
      this._sources.filename[index] = filenameIndex;
      this._sources.length++;

      if (uuid !== null) {
        this._uuidToSourceIndex.set(uuid, index);
      } else {
        this._filenameToSourceIndex.set(filenameIndex, index);
      }
    }
    return index;
  }

  // Get the processed source index by UUID
  getSourceIndexByUuid(uuid: string): IndexIntoSourceTable | null {
    return this._uuidToSourceIndex.get(uuid) ?? null;
  }

  getStringTable(): StringTable {
    return this._stringTable;
  }

  getSources(): SourceTable {
    return this._sources;
  }

  // Package up all de-duplicated global tables so that they can be embedded in
  // the profile.
  finish(): { libs: Lib[]; shared: RawProfileSharedData } {
    const shared: RawProfileSharedData = {
      stringArray: this._stringArray,
      sources: this._sources,
    };

    return { libs: this._libs, shared };
  }
}
