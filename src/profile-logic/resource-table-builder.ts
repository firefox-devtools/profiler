/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getEmptyResourceTable } from './data-structures';
import { ResourceType } from 'firefox-profiler/types';

import type {
  ExtensionTable,
  IndexIntoResourceTable,
  IndexIntoStringTable,
  ResourceTable,
} from 'firefox-profiler/types';
import type { StringTable } from '../utils/string-table';

/**
 * ResourceTableBuilder de-duplicates resources while a resource table is being
 * built. It can start out empty, during profile processing, or with the
 * contents of an existing resource table, for example during symbolication.
 */
export class ResourceTableBuilder {
  _resourceTable: ResourceTable;
  _stringTable: StringTable;
  _libNameToResourceIndex: Map<IndexIntoStringTable, IndexIntoResourceTable> =
    new Map();
  _originToResourceIndex: Map<string, IndexIntoResourceTable> = new Map();
  // Maps the string index of an extension ID to its add-on resource in the
  // existing resource table, so that addExtensionOrigins can reuse it.
  _extensionIdToResourceIndex: Map<
    IndexIntoStringTable,
    IndexIntoResourceTable
  > = new Map();

  constructor(stringTable: StringTable, existingResources?: ResourceTable) {
    this._stringTable = stringTable;
    if (existingResources === undefined) {
      this._resourceTable = getEmptyResourceTable();
      return;
    }

    // Copy the existing table so that the original is not mutated.
    this._resourceTable = {
      length: existingResources.length,
      name: existingResources.name.slice(),
      host: existingResources.host.slice(),
      type: existingResources.type.slice(),
    };
    for (let i = 0; i < existingResources.length; i++) {
      const name = existingResources.name[i];
      switch (existingResources.type[i]) {
        case ResourceType.Library:
          if (!this._libNameToResourceIndex.has(name)) {
            this._libNameToResourceIndex.set(name, i);
          }
          break;
        case ResourceType.Webhost:
        case ResourceType.Url: {
          // The name of a webhost resource is its origin. The name of a url
          // resource is its URI, which indexForURIResource uses as its origin.
          const origin = stringTable.getString(name);
          if (!this._originToResourceIndex.has(origin)) {
            this._originToResourceIndex.set(origin, i);
          }
          break;
        }
        case ResourceType.Addon: {
          // The host of an add-on resource is the extension ID.
          const host = existingResources.host[i];
          if (host !== null && !this._extensionIdToResourceIndex.has(host)) {
            this._extensionIdToResourceIndex.set(host, i);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // Prepopulate the resource table and this._originToResourceIndex so that
  // future calls to indexForURIResource will return an add-on resource for
  // add-on URI origins.
  addExtensionOrigins(extensions: ExtensionTable): void {
    const resourceTable = this._resourceTable;
    for (let i = 0; i < extensions.length; i++) {
      const origin = new URL(extensions.baseURL[i]).origin;
      if (this._originToResourceIndex.has(origin)) {
        continue;
      }

      const idIndex = this._stringTable.indexForString(extensions.id[i]);
      let resourceIndex = this._extensionIdToResourceIndex.get(idIndex);
      if (resourceIndex === undefined) {
        resourceIndex = resourceTable.length++;

        const quotedName = JSON.stringify(extensions.name[i]);
        const name = `Extension ${quotedName} (ID: ${extensions.id[i]})`;

        resourceTable.name[resourceIndex] =
          this._stringTable.indexForString(name);
        resourceTable.host[resourceIndex] = idIndex;
        resourceTable.type[resourceIndex] = ResourceType.Addon;
      }
      this._originToResourceIndex.set(origin, resourceIndex);
    }
  }

  // Returns the resource index for a "url" or "webhost" resource which is created
  // on demand based on the script URI.
  indexForURIResource(scriptURI: string): IndexIntoResourceTable {
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
      resourceTable.name[resourceIndex] =
        this._stringTable.indexForString(origin);
      resourceTable.host[resourceIndex] =
        this._stringTable.indexForString(host);
      resourceTable.type[resourceIndex] = ResourceType.Webhost;
    } else {
      // This is a URL, but it doesn't point to something on the web, e.g. a
      // chrome url.
      resourceTable.name[resourceIndex] =
        this._stringTable.indexForString(scriptURI);
      resourceTable.host[resourceIndex] = null;
      resourceTable.type[resourceIndex] = ResourceType.Url;
    }
    return resourceIndex;
  }

  indexForLibResourceByName(
    libNameStringIndex: IndexIntoStringTable
  ): IndexIntoResourceTable {
    let resourceIndex = this._libNameToResourceIndex.get(libNameStringIndex);
    if (resourceIndex !== undefined) {
      return resourceIndex;
    }

    const resourceTable = this._resourceTable;

    resourceIndex = resourceTable.length++;
    this._libNameToResourceIndex.set(libNameStringIndex, resourceIndex);
    resourceTable.name[resourceIndex] = libNameStringIndex;
    resourceTable.host[resourceIndex] = null;
    resourceTable.type[resourceIndex] = ResourceType.Library;
    return resourceIndex;
  }

  finish(): ResourceTable {
    return this._resourceTable;
  }
}
