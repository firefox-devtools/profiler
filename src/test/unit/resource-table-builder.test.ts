/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ResourceTableBuilder } from '../../profile-logic/resource-table-builder';
import { StringTable } from '../../utils/string-table';
import { ResourceType } from 'firefox-profiler/types';

describe('ResourceTableBuilder', function () {
  it('reuses the resources of an existing resource table', function () {
    const stringTable = StringTable.withBackingArray([]);
    const original = new ResourceTableBuilder(stringTable);
    const libResource = original.indexForLibResourceByName(
      stringTable.indexForString('libxul.so')
    );
    const webhostResource = original.indexForURIResource(
      'https://example.com/script.js'
    );
    const urlResource = original.indexForURIResource(
      'chrome://browser/content/browser.js'
    );
    const existingResources = original.finish();
    const existingLength = existingResources.length;

    const builder = new ResourceTableBuilder(stringTable, existingResources);
    expect(
      builder.indexForLibResourceByName(stringTable.indexForString('libxul.so'))
    ).toBe(libResource);
    expect(builder.indexForURIResource('https://example.com/other.js')).toBe(
      webhostResource
    );
    expect(
      builder.indexForURIResource('chrome://browser/content/browser.js')
    ).toBe(urlResource);

    const newResource = builder.indexForURIResource('https://example.org/');
    const resourceTable = builder.finish();
    expect(newResource).toBe(existingLength);
    expect(resourceTable.type[newResource]).toBe(ResourceType.Webhost);
    expect(resourceTable.length).toBe(existingLength + 1);

    // The existing table is not mutated.
    expect(existingResources.length).toBe(existingLength);
    expect(existingResources.name).toHaveLength(existingLength);
  });
});
