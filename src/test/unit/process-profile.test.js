/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { extractFuncsAndResourcesFromFrameLocations } from '../../profile-logic/process-profile';
import { UniqueStringArray } from '../../utils/unique-string-array';

describe('extract functions and resource from location strings', function() {
  // These location strings are turned into the proper funcs.
  const locations = [
    // Extract unsymbolicated memory and match them to libraries.
    '0xc0ff33',
    '0xe0ff33',

    // Extract C++ function names and resources
    'cppFunction1 (in c++ resource name1) + 123',
    'cppFunction2 (in c++ resource name2) (234:345)',
    'cppFunction3 (in c++ resource name2)',

    // Extract JS functions URL information
    'jsFunction1 (http://script.com/one.js:456:1)',
    'http://script.com/one.js:456:1',

    // Extension locations
    'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/background.js:1:0',
    'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/content.js:1:0',
    'backgroundFunction (moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/background.js:2:1)',
    'contentfunction (moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/content.js:2:1)',

    // Something unknown
    'mysterious location',
  ];
  const libs = [
    // This library will match the '0xc0ff33' location.
    {
      start: 0xc00000,
      end: 0xd00000,
      offset: 0,
      arch: '',
      name: 'No symbols library',
      path: '',
      debugName: '',
      debugPath: '',
      breakpadId: '',
    },
    // This library will match the '0xe0ff33' location, and it has an offset.
    {
      start: 0xe01000,
      end: 0xf00000,
      offset: 0x1000,
      arch: '',
      name: 'No symbols library',
      path: '',
      debugName: '',
      debugPath: '',
      breakpadId: '',
    },
  ];
  const stringTable = new UniqueStringArray();
  const locationIndexes = locations.map(location =>
    stringTable.indexForString(location)
  );
  const extensions = {
    baseURL: [
      'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/',
      'moz-extension://fa2edf9c-c45f-4445-b819-c09e3f2d58d5/',
    ],
    id: ['geckoprofiler@mozilla.com', 'screenshots@mozilla.org'],
    name: ['Gecko Profiler', 'Firefox Screenshots'],
    length: 2,
  };

  it('extracts the information for all different types of locations', function() {
    const [
      funcTable,
      resourceTable,
      frameFuncs,
    ] = extractFuncsAndResourcesFromFrameLocations(
      locationIndexes,
      stringTable,
      libs,
      extensions
    );

    expect(
      frameFuncs.map((funcIndex, locationIndex) => {
        // Map all the results into a human readable object for easy snapshotting.
        const locationName = locations[locationIndex];

        const funcName = stringTable.getString(funcTable.name[funcIndex]);
        const resourceIndex = funcTable.resource[funcIndex];
        const address = funcTable.address[funcIndex];
        const isJS = funcTable.isJS[funcIndex];
        const fileNameIndex = funcTable.fileName[funcIndex];
        const fileName =
          fileNameIndex === null ? null : stringTable.getString(fileNameIndex);
        const lineNumber = funcTable.lineNumber[funcIndex];
        const columnNumber = funcTable.columnNumber[funcIndex];
        let libIndex, resourceName, host, resourceType;
        if (resourceIndex === -1) {
          resourceName = null;
          host = null;
          resourceType = null;
        } else {
          const hostStringIndex = resourceTable.host[resourceIndex];
          libIndex = resourceTable.lib[resourceIndex];
          resourceName = stringTable.getString(
            resourceTable.name[resourceIndex]
          );
          host =
            hostStringIndex === undefined
              ? null
              : stringTable.getString(hostStringIndex);
          resourceType = resourceTable.type[resourceIndex];
        }
        const lib =
          libIndex === undefined || libIndex === null || libIndex === -1
            ? undefined
            : libs[libIndex];

        return [
          locationName,
          {
            funcName,
            isJS,
            resourceIndex,
            address,
            fileName,
            lineNumber,
            columnNumber,
            libIndex,
            resourceName,
            host,
            resourceType,
            lib,
          },
        ];
      })
    ).toMatchSnapshot();
  });
});
