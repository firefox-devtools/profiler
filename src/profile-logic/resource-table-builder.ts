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
 * built.
 */
export class ResourceTableBuilder {
  _resourceTable: ResourceTable;
  _stringTable: StringTable;
  _libNameToResourceIndex: Map<IndexIntoStringTable, IndexIntoResourceTable> =
    new Map();
  _originToResourceIndex: Map<string, IndexIntoResourceTable> = new Map();

  constructor(stringTable: StringTable) {
    this._stringTable = stringTable;
    this._resourceTable = getEmptyResourceTable();
  }

  // Prepopulate the resource table and this._originToResourceIndex so that
  // future calls to indexForURIResource will return an add-on resource for
  // add-on URI origins.
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

        resourceTable.name[resourceIndex] =
          this._stringTable.indexForString(name);
        resourceTable.host[resourceIndex] = idIndex;
        resourceTable.type[resourceIndex] = ResourceType.Addon;
      }
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
