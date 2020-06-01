/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { AddressResult, LibSymbolicationRequest } from './symbol-store';
import { SymbolsNotFoundError } from './errors';

// This file handles requesting symbolication information from the Mozilla
// symbol server using the API described on
// https://tecken.readthedocs.io/en/latest/symbolication.html .
// Specifically, it uses version 5 of the API, which was implemented in
// https://bugzilla.mozilla.org/show_bug.cgi?id=1377479 .

type APIFoundModules = {
  // For every requested library in the memoryMap, this object contains a string
  // key of the form `${debugName}/${breakpadId}`. The value is null if no
  // address with the module index was requested, and otherwise a boolean that
  // says whether the symbol server had symbols for this library.
  [string]: null | boolean,
};

type APIFrameInfo = {
  // The hex version of the address that we requested (e.g. "0x5ab").
  module_offset: string,
  // The debugName of the library that this frame was in.
  module: string,
  // The index of this APIFrameInfo in its enclosing APIStack.
  frame: number,
  // The name of the function this frame was in, if symbols were found.
  function?: string,
  // The hex offset between the requested address and the start of the function,
  // e.g. "0x3c".
  function_offset?: string,
};

type APIStack = APIFrameInfo[];

type APIJobResult = {
  found_modules: APIFoundModules,
  stacks: APIStack[],
};

type APIResult = {
  results: APIJobResult[],
};

// Make sure that the JSON blob we receive from the API conforms to our flow
// type definition.
function _ensureIsAPIResult(result: any): APIResult {
  if (!(result instanceof Object) || !('results' in result)) {
    throw new Error('Expected an object with property `results`');
  }
  const results = result.results;
  if (!Array.isArray(results)) {
    throw new Error('Expected `results` to be an array');
  }
  for (const jobResult of results) {
    if (
      !(jobResult instanceof Object) ||
      !('found_modules' in jobResult) ||
      !('stacks' in jobResult)
    ) {
      throw new Error(
        'Expected jobResult to have `found_modules` and `stacks` properties'
      );
    }
    const found_modules = jobResult.found_modules;
    if (!(found_modules instanceof Object)) {
      throw new Error('Expected `found_modules` to be an object');
    }
    const stacks = jobResult.stacks;
    if (!Array.isArray(stacks)) {
      throw new Error('Expected `stacks` to be an array');
    }
    for (const stack of stacks) {
      if (!Array.isArray(stack)) {
        throw new Error('Expected `stack` to be an array');
      }
      for (const frameInfo of stack) {
        if (!(frameInfo instanceof Object)) {
          throw new Error('Expected `frameInfo` to be an object');
        }
        if (
          !('module_offset' in frameInfo) ||
          !('module' in frameInfo) ||
          !('frame' in frameInfo)
        ) {
          throw new Error(
            'Expected frameInfo to have `module_offset`, `module` and `frame` properties'
          );
        }
      }
    }
  }
  return result;
}

// Request symbols for the given addresses and libraries using the Mozilla
// symbolication API.
// Returns an array of promises, one promise per LibSymbolicationRequest in
// requests. If the server does not have symbol information for a given library,
// the promise for that library will fail.
// That's the reason why this function does not return just one promise: We want
// to indicate failure status for each library independently. Under the hood,
// only one request is made to the server.
export function requestSymbols(
  requests: LibSymbolicationRequest[]
): Array<Promise<Map<number, AddressResult>>> {
  const addressArrays = requests.map(({ addresses }) => Array.from(addresses));
  const body = {
    memoryMap: requests.map(({ lib: { debugName, breakpadId } }) => [
      debugName,
      breakpadId,
    ]),
    stacks: addressArrays.map((addressArray, libIndex) =>
      addressArray.map(addr => [libIndex, addr])
    ),
  };

  const jsonPromise = fetch('http://127.0.0.1:3000/symbolicate/v5', {
    body: JSON.stringify(body),
    method: 'POST',
    mode: 'cors',
  }).then(response => response.json());

  return requests.map(async function(request, libIndex) {
    const { lib } = request;
    const { debugName, breakpadId } = lib;

    let json;
    try {
      json = _ensureIsAPIResult(await jsonPromise).results[0];
    } catch (error) {
      throw new SymbolsNotFoundError(
        'There was a problem with the JSON returned by the symbolication API.',
        lib,
        error
      );
    }

    if (!json.found_modules[`${debugName}/${breakpadId}`]) {
      throw new SymbolsNotFoundError(
        `The symbol server does not have symbols for ${debugName}/${breakpadId}.`,
        lib
      );
    }

    const addressInfo = json.stacks[libIndex];
    const addressArray = addressArrays[libIndex];
    if (addressInfo.length !== addressArray.length) {
      throw new SymbolsNotFoundError(
        'The result from the symbol server has an unexpected length.',
        lib
      );
    }

    const results = new Map();
    for (let i = 0; i < addressInfo.length; i++) {
      const address = addressArray[i];
      const info = addressInfo[i];
      if (info.function !== undefined && info.function_offset !== undefined) {
        results.set(address, {
          name: info.function,
          functionOffset: parseInt(info.function_offset.substr(2), 16),
        });
      } else {
        throw new SymbolsNotFoundError(
          `The result from the symbol server did not contain function information for address ${address}, even though found_modules was true for the library that this address belongs to`,
          lib
        );
      }
    }
    return results;
  });
}
