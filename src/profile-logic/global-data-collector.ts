/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { StringTable } from '../utils/string-table';
import {
  finishRawFrameTableBuilder,
  finishRawFuncTableBuilder,
  finishRawNativeSymbolTableBuilder,
  finishRawStackTableBuilder,
  getRawFrameTableBuilder,
  getRawFuncTableBuilder,
  getRawNativeSymbolTableBuilder,
  getEmptySourceTable,
  getEmptySourceLocationTable,
  getRawStackTableBuilder,
} from './data-structures';
import { ResourceTableBuilder } from './resource-table-builder';

import type {
  Lib,
  LibMapping,
  IndexIntoLibs,
  IndexIntoStringTable,
  IndexIntoSourceTable,
  RawProfileSharedData,
  SourceTable,
  IndexIntoResourceTable,
  IndexIntoFuncTable,
  ExtensionTable,
  IndexIntoNativeSymbolTable,
  Address,
  Bytes,
} from 'firefox-profiler/types';
import { FuncFlag } from 'firefox-profiler/types';
import type {
  RawFrameTableBuilder,
  RawFuncTableBuilder,
  RawNativeSymbolTableBuilder,
  RawStackTableBuilder,
} from './data-structures';

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
  _sources: SourceTable = getEmptySourceTable();
  _frameTable: RawFrameTableBuilder = getRawFrameTableBuilder();
  _stackTableBuilder: RawStackTableBuilder = getRawStackTableBuilder();
  _funcTable: RawFuncTableBuilder = getRawFuncTableBuilder();
  _resources: ResourceTableBuilder = new ResourceTableBuilder(
    this._stringTable
  );
  _nativeSymbols: RawNativeSymbolTableBuilder =
    getRawNativeSymbolTableBuilder();
  _funcKeyToFuncIndex: Map<string, IndexIntoFuncTable> = new Map();
  _nativeSymbolKeyToNativeSymbolIndex: Map<string, IndexIntoNativeSymbolTable> =
    new Map();
  _idToSourceIndex: Map<string, IndexIntoSourceTable> = new Map();
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

  indexForFunc(
    name: IndexIntoStringTable,
    isJS: boolean,
    relevantForJS: boolean,
    resource: IndexIntoResourceTable | -1,
    source: IndexIntoSourceTable | null,
    lineNumber: number | null,
    columnNumber: number | null
  ): IndexIntoFuncTable {
    const funcKey = `${name}-${isJS}-${relevantForJS}-${resource}-${source}-${lineNumber}-${columnNumber}`;
    let funcIndex = this._funcKeyToFuncIndex.get(funcKey);
    if (funcIndex === undefined) {
      let flags = 0;
      if (isJS) {
        flags |= FuncFlag.IsJS;
      }
      if (relevantForJS) {
        flags |= FuncFlag.RelevantForJS;
      }
      if (resource !== -1) {
        flags |= FuncFlag.HasResource;
      }
      if (source !== null) {
        flags |= FuncFlag.HasSource;
      }
      if (lineNumber !== null) {
        flags |= FuncFlag.HasLine;
      }
      if (columnNumber !== null) {
        flags |= FuncFlag.HasColumn;
      }
      funcIndex = this._funcTable.length++;
      this._funcTable.flags[funcIndex] = flags;
      this._funcTable.name[funcIndex] = name;
      this._funcTable.resource[funcIndex] = resource === -1 ? 0 : resource;
      this._funcTable.source[funcIndex] = source ?? 0;
      this._funcTable.lineNumber[funcIndex] = lineNumber ?? 0;
      this._funcTable.columnNumber[funcIndex] = columnNumber ?? 0;
      this._funcTable.originalLocation[funcIndex] = 0;
      this._funcKeyToFuncIndex.set(funcKey, funcIndex);
    }
    return funcIndex;
  }

  // Return the global index for this source, adding it to the global list if
  // necessary.
  indexForSource(
    id: string | null,
    filename: string,
    startLine: number = 1,
    startColumn: number = 1,
    sourceMapURL: string | null = null
  ): IndexIntoSourceTable {
    let index: IndexIntoSourceTable | undefined;

    if (id !== null) {
      index = this._idToSourceIndex.get(id);
    } else {
      // For null IDs, use filename-based lookup.
      const filenameIndex = this._stringTable.indexForString(filename);
      index = this._filenameToSourceIndex.get(filenameIndex);
    }

    if (index === undefined) {
      index = this._sources.length;
      const filenameIndex = this._stringTable.indexForString(filename);
      const sourceMapURLIndex =
        sourceMapURL !== null
          ? this._stringTable.indexForString(sourceMapURL)
          : null;
      this._sources.id[index] = id;
      this._sources.filename[index] = filenameIndex;
      this._sources.startLine[index] = startLine;
      this._sources.startColumn[index] = startColumn;
      this._sources.sourceMapURL[index] = sourceMapURLIndex;
      this._sources.content[index] = null;
      this._sources.length++;

      if (id !== null) {
        this._idToSourceIndex.set(id, index);
      } else {
        this._filenameToSourceIndex.set(filenameIndex, index);
      }
    }
    return index;
  }

  // Prepopulate the resource table so that future calls to indexForURIResource
  // will return an add-on resource for add-on URI origins.
  addExtensionOrigins(extensions: ExtensionTable): void {
    this._resources.addExtensionOrigins(extensions);
  }

  // Returns the resource index for a "url" or "webhost" resource which is created
  // on demand based on the script URI.
  indexForURIResource(scriptURI: string): IndexIntoResourceTable {
    return this._resources.indexForURIResource(scriptURI);
  }

  indexForLibResourceByName(
    libNameStringIndex: IndexIntoStringTable
  ): IndexIntoResourceTable {
    return this._resources.indexForLibResourceByName(libNameStringIndex);
  }

  indexForLibResourceByLib(libIndex: IndexIntoLibs): IndexIntoResourceTable {
    return this.indexForLibResourceByName(
      this._stringTable.indexForString(this._libs[libIndex].name)
    );
  }

  indexForNativeSymbol(
    libIndex: IndexIntoLibs,
    address: Address,
    name: IndexIntoStringTable,
    functionSize: Bytes | null
  ): IndexIntoNativeSymbolTable {
    const key = `${libIndex}-${address}-${name}-${functionSize ?? ''}`;
    let nativeSymbolIndex = this._nativeSymbolKeyToNativeSymbolIndex.get(key);
    if (nativeSymbolIndex === undefined) {
      nativeSymbolIndex = this._nativeSymbols.length++;
      this._nativeSymbols.libIndex[nativeSymbolIndex] = libIndex;
      this._nativeSymbols.address[nativeSymbolIndex] = address;
      this._nativeSymbols.name[nativeSymbolIndex] = name;
      this._nativeSymbols.functionSize[nativeSymbolIndex] = functionSize ?? -1;
      this._nativeSymbolKeyToNativeSymbolIndex.set(key, nativeSymbolIndex);
    }
    return nativeSymbolIndex;
  }

  getStringTable(): StringTable {
    return this._stringTable;
  }

  getFrameTable(): RawFrameTableBuilder {
    return this._frameTable;
  }

  getStackTableBuilder(): RawStackTableBuilder {
    return this._stackTableBuilder;
  }

  // Package up all de-duplicated global tables so that they can be embedded in
  // the profile.
  finish(): { libs: Lib[]; shared: RawProfileSharedData } {
    const shared: RawProfileSharedData = {
      stackTable: finishRawStackTableBuilder(this._stackTableBuilder),
      frameTable: finishRawFrameTableBuilder(this._frameTable),
      funcTable: finishRawFuncTableBuilder(this._funcTable),
      resourceTable: this._resources.finish(),
      nativeSymbols: finishRawNativeSymbolTableBuilder(this._nativeSymbols),
      stringArray: this._stringArray,
      sources: this._sources,
      sourceLocationTable: getEmptySourceLocationTable(),
    };

    return { libs: this._libs, shared };
  }
}
