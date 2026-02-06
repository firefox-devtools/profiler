/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { StringTable } from '../utils/string-table';
import {
  getEmptyFrameTable,
  getEmptyFuncTable,
  getEmptyNativeSymbolTable,
  getEmptyRawStackTable,
  getEmptyResourceTable,
  getEmptySourceTable,
  resourceTypes,
} from './data-structures';

import type {
  Lib,
  LibMapping,
  IndexIntoLibs,
  IndexIntoStringTable,
  IndexIntoSourceTable,
  RawProfileSharedData,
  SourceTable,
  FrameTable,
  RawStackTable,
  FuncTable,
  ResourceTable,
  NativeSymbolTable,
  IndexIntoResourceTable,
  IndexIntoFuncTable,
  ExtensionTable,
  IndexIntoNativeSymbolTable,
  Address,
  Bytes,
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
  _sources: SourceTable = getEmptySourceTable();
  _frameTable: FrameTable = getEmptyFrameTable();
  _stackTable: RawStackTable = getEmptyRawStackTable();
  _funcTable: FuncTable = getEmptyFuncTable();
  _resourceTable: ResourceTable = getEmptyResourceTable();
  _nativeSymbols: NativeSymbolTable = getEmptyNativeSymbolTable();
  _funcKeyToFuncIndex: Map<string, IndexIntoFuncTable> = new Map();
  _nativeSymbolKeyToNativeSymbolIndex: Map<string, IndexIntoNativeSymbolTable> =
    new Map();
  _uuidToSourceIndex: Map<string, IndexIntoSourceTable> = new Map();
  _libIndexToResourceIndex: Map<IndexIntoLibs, IndexIntoResourceTable> =
    new Map();
  _libNameToResourceIndex: Map<IndexIntoStringTable, IndexIntoResourceTable> =
    new Map();
  _originToResourceIndex: Map<string, IndexIntoResourceTable> = new Map();
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
      funcIndex = this._funcTable.length++;
      this._funcTable.name[funcIndex] = name;
      this._funcTable.isJS[funcIndex] = isJS;
      this._funcTable.relevantForJS[funcIndex] = relevantForJS;
      this._funcTable.resource[funcIndex] = resource;
      this._funcTable.source[funcIndex] = source;
      this._funcTable.lineNumber[funcIndex] = lineNumber;
      this._funcTable.columnNumber[funcIndex] = columnNumber;
      this._funcKeyToFuncIndex.set(funcKey, funcIndex);
    }
    return funcIndex;
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

  // Prepopulate resourceTable and this._originToResourceIndex so that future calls
  // to indexForURIResource will return an add-on resource for add-on URI origins.
  addExtensionOrigins(extensions: ExtensionTable): void {
    const resourceTable = this._resourceTable;
    for (let i = 0; i < extensions.length; i++) {
      const origin = new URL(extensions.baseURL[i]).origin;

      let resourceIndex = this._originToResourceIndex.get(origin);
      if (resourceIndex === undefined) {
        resourceIndex = resourceTable.length++;
        this._originToResourceIndex.set(origin, resourceIndex);

        const quotedName = JSON.stringify(extensions.name[i]);
        const name = `Extension ${quotedName} (ID: ${extensions.id[i]})`;

        const idIndex = this._stringTable.indexForString(extensions.id[i]);

        resourceTable.lib[resourceIndex] = null;
        resourceTable.name[resourceIndex] =
          this._stringTable.indexForString(name);
        resourceTable.host[resourceIndex] = idIndex;
        resourceTable.type[resourceIndex] = resourceTypes.addon;
      }
    }
  }

  // Returns the resource index for a "url" or "webhost" resource which is created
  // on demand based on the script URI.
  indexForURIResource(scriptURI: string) {
    // Figure out the origin and host.
    let origin;
    let host;
    try {
      const url = new URL(scriptURI);
      if (
        !(
          url.protocol === 'http:' ||
          url.protocol === 'https:' ||
          url.protocol === 'moz-extension:'
        )
      ) {
        throw new Error('not a webhost or extension protocol');
      }
      origin = url.origin;
      host = url.host;
    } catch (_e) {
      origin = scriptURI;
      host = null;
    }

    let resourceIndex = this._originToResourceIndex.get(origin);
    if (resourceIndex !== undefined) {
      return resourceIndex;
    }

    const resourceTable = this._resourceTable;

    resourceIndex = resourceTable.length++;
    this._originToResourceIndex.set(origin, resourceIndex);
    if (host) {
      // This is a webhost URL.
      resourceTable.lib[resourceIndex] = null;
      resourceTable.name[resourceIndex] =
        this._stringTable.indexForString(origin);
      resourceTable.host[resourceIndex] =
        this._stringTable.indexForString(host);
      resourceTable.type[resourceIndex] = resourceTypes.webhost;
    } else {
      // This is a URL, but it doesn't point to something on the web, e.g. a
      // chrome url.
      resourceTable.lib[resourceIndex] = null;
      resourceTable.name[resourceIndex] =
        this._stringTable.indexForString(scriptURI);
      resourceTable.host[resourceIndex] = null;
      resourceTable.type[resourceIndex] = resourceTypes.url;
    }
    return resourceIndex;
  }

  indexForLibResource(libIndex: IndexIntoLibs): IndexIntoResourceTable {
    let resourceIndex = this._libIndexToResourceIndex.get(libIndex);
    if (resourceIndex !== undefined) {
      return resourceIndex;
    }

    const resourceTable = this._resourceTable;

    resourceIndex = this._resourceTable.length++;
    this._libIndexToResourceIndex.set(libIndex, resourceIndex);
    resourceTable.lib[resourceIndex] = libIndex;
    resourceTable.name[resourceIndex] = this._stringTable.indexForString(
      this._libs[libIndex].name
    );
    resourceTable.host[resourceIndex] = null;
    resourceTable.type[resourceIndex] = resourceTypes.library;
    return resourceIndex;
  }

  indexForNameOnlyLibResource(
    libNameStringIndex: IndexIntoStringTable
  ): IndexIntoResourceTable {
    let resourceIndex = this._libNameToResourceIndex.get(libNameStringIndex);
    if (resourceIndex !== undefined) {
      return resourceIndex;
    }

    const resourceTable = this._resourceTable;

    resourceIndex = this._resourceTable.length++;
    this._libIndexToResourceIndex.set(libNameStringIndex, resourceIndex);
    resourceTable.lib[resourceIndex] = null;
    resourceTable.name[resourceIndex] = libNameStringIndex;
    resourceTable.host[resourceIndex] = null;
    resourceTable.type[resourceIndex] = resourceTypes.library;
    return resourceIndex;
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
      this._nativeSymbols.functionSize[nativeSymbolIndex] = functionSize;
      this._nativeSymbolKeyToNativeSymbolIndex.set(key, nativeSymbolIndex);
    }
    return nativeSymbolIndex;
  }

  getStringTable(): StringTable {
    return this._stringTable;
  }

  getFrameTable(): FrameTable {
    return this._frameTable;
  }

  getStackTable(): RawStackTable {
    return this._stackTable;
  }

  // Package up all de-duplicated global tables so that they can be embedded in
  // the profile.
  finish(): { libs: Lib[]; shared: RawProfileSharedData } {
    const shared: RawProfileSharedData = {
      stackTable: this._stackTable,
      frameTable: this._frameTable,
      funcTable: this._funcTable,
      resourceTable: this._resourceTable,
      nativeSymbols: this._nativeSymbols,
      stringArray: this._stringArray,
      sources: this._sources,
    };

    return { libs: this._libs, shared };
  }
}
