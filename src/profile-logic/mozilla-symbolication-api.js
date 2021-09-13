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

type APIFoundModulesV5 = {
  // For every requested library in the memoryMap, this object contains a string
  // key of the form `${debugName}/${breakpadId}`. The value is null if no
  // address with the module index was requested, and otherwise a boolean that
  // says whether the symbol server had symbols for this library.
  [string]: null | boolean,
};

type APIFrameInfoV5 = {
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
  // The path of the file that contains the function this frame was in, optional.
  // As of June 2021, this is only supported on the staging symbolication server
  // ("Eliot") but not on the implementation that's currently in production ("Tecken").
  // e.g. "hg:hg.mozilla.org/mozilla-central:js/src/vm/Interpreter.cpp:24938c537a55f9db3913072d33b178b210e7d6b5"
  file?: string,
  // The line number that contains the source code that generated the instructions at the address, optional.
  // (Same support as file.)
  // e.g. 543
  line?: number,
};

type APIStackV5 = APIFrameInfoV5[];

type APIJobResultV5 = {
  found_modules: APIFoundModulesV5,
  stacks: APIStackV5[],
};

type APIResultV5 = {
  results: APIJobResultV5[],
};

// Make sure that the JSON blob we receive from the API conforms to our flow
// type definition.
function _ensureIsAPIResultV5(result: any): APIResultV5 {
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
        if ('file' in frameInfo && typeof frameInfo.file !== 'string') {
          throw new Error('Expected frameInfo.file to be a string, if present');
        }
        if ('line' in frameInfo && typeof frameInfo.line !== 'number') {
          throw new Error('Expected frameInfo.line to be a number, if present');
        }
      }
    }
  }
  return result;
}

function getV5ResultForLibRequest(
  request: LibSymbolicationRequest,
  addressArray: number[],
  json: APIJobResultV5
): Map<number, AddressResult> {
  const { lib } = request;
  const { debugName, breakpadId } = lib;

  if (!json.found_modules[`${debugName}/${breakpadId}`]) {
    throw new SymbolsNotFoundError(
      `The symbol server does not have symbols for ${debugName}/${breakpadId}.`,
      lib
    );
  }

  const addressInfo = json.stacks[0];
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
    let addressResult;
    if (info.function !== undefined && info.function_offset !== undefined) {
      const name = info.function;
      const functionOffset = parseInt(info.function_offset.substr(2), 16);
      addressResult = {
        name,
        symbolAddress: address - functionOffset,
        file: info.file,
        line: info.line,
      };
    } else {
      // This can happen if the address is between functions, or before the first
      // or after the last function.
      addressResult = {
        name: `<unknown at ${info.module_offset}>`,
        symbolAddress: address,
      };
    }
    results.set(address, addressResult);
  }
  return results;
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
  requests: LibSymbolicationRequest[],
  symbolsUrl: string
): Array<Promise<Map<number, AddressResult>>> {
  // For each request, turn its set of addresses into an array.
  // We need there to be a defined order in each addressArray so that we can
  // match the results to the request.
  const requestsWithAddressArrays = requests.map((request) => ({
    request,
    addressArray: Array.from(request.addresses),
  }));

  // Construct the API request body. We make one "job" per LibSymbolicatioRequest.
  // Each "job" has a module list with just one "module" (the lib), and a list
  // of stacks with just one "stack", which contains all addresses for that lib.
  const body = {
    jobs: requestsWithAddressArrays.map(({ request, addressArray }) => {
      const { debugName, breakpadId } = request.lib;
      return {
        memoryMap: [[debugName, breakpadId]],
        stacks: [addressArray.map((addr) => [0, addr])],
      };
    }),
  };

  const jsonPromise = fetch(symbolsUrl + '/symbolicate/v5', {
    body: JSON.stringify(body),
    method: 'POST',
    mode: 'cors',
  })
    .then((response) => response.json())
    .then(_ensureIsAPIResultV5);

  return requestsWithAddressArrays.map(async function (
    { request, addressArray },
    requestIndex
  ) {
    const { lib } = request;

    let json;
    try {
      json = (await jsonPromise).results[requestIndex];
    } catch (error) {
      throw new SymbolsNotFoundError(
        'There was a problem with the JSON returned by the symbolication API.',
        lib,
        error
      );
    }

    return getV5ResultForLibRequest(request, addressArray, json);
  });
}
