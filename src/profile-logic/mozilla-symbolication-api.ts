/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  AddressResult,
  LibSymbolicationRequest,
  LibSymbolicationResponse,
} from './symbol-store';

// This file handles requesting symbolication information using the API described
// on https://tecken.readthedocs.io/en/latest/symbolication.html .
// Specifically, it uses version 5 of the API, which was implemented in
// https://bugzilla.mozilla.org/show_bug.cgi?id=1377479 .
//
// The actual request happens via a callback. We use two different callbacks:
//
//  - When requesting symbols via HTTP, we use a callback which calls fetch.
//    This is used to request symbols from the Mozilla Symbolication Server,
//    or from an alternative symbol server which was configured with a
//    ?symbolServer URL parameter.
//  - When requesting symbols from the browser, we use a callback which sends a
//    WebChannel message. The WebChannel has a querySymbolicationApi entry point
//    which uses the same API as the server.

// The type for the callback, see comment above.
export type QuerySymbolicationApiCallback = (
  path: string,
  requestJson: string
) => Promise<unknown>;

type APIFoundModulesV5 = {
  // For every requested library in the memoryMap, this object contains a string
  // key of the form `${debugName}/${breakpadId}`. The value is null if no
  // address with the module index was requested, and otherwise a boolean that
  // says whether the symbol server had symbols for this library.
  [key: string]: null | boolean;
};

type APIInlineFrameInfoV5 = {
  // The name of the function this inline frame was in, if known.
  function?: string;
  // The path of the file that contains the function this inline frame was in, optional.
  file?: string;
  // The line number that contains the source code for this inline frame that
  // contributed to the instruction at the looked-up address, optional.
  // e.g. 543
  line?: number;
};

type APIFrameInfoV5 = {
  // The hex version of the address that we requested (e.g. "0x5ab").
  module_offset: string;
  // The debugName of the library that this frame was in.
  module: string;
  // The index of this APIFrameInfo in its enclosing APIStack.
  frame: number;
  // The name of the function this frame was in, if symbols were found.
  function?: string;
  // The hex offset between the requested address and the start of the function,
  // e.g. "0x3c".
  function_offset?: string;
  // An optional size, in bytes, of the machine code of the outer function that
  // this address belongs to, as a hex string, e.g. "0x270".
  function_size?: string;
  // The path of the file that contains the function this frame was in, optional.
  // As of June 2021, this is only supported on the staging symbolication server
  // ("Eliot") but not on the implementation that's currently in production ("Tecken").
  // e.g. "hg:hg.mozilla.org/mozilla-central:js/src/vm/Interpreter.cpp:24938c537a55f9db3913072d33b178b210e7d6b5"
  file?: string;
  // The line number that contains the source code that generated the instructions at the address, optional.
  // (Same support as file.)
  // e.g. 543
  line?: number;
  // Information about functions that were inlined at this address.
  // Ordered from inside to outside.
  // As of November 2021, this is only supported by profiler-symbol-server.
  // Adding this functionality to the Mozilla symbol server is tracked in
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1636194
  inlines?: APIInlineFrameInfoV5[];
};

type APIStackV5 = APIFrameInfoV5[];

type APIJobResultV5 = {
  found_modules: APIFoundModulesV5;
  stacks: APIStackV5[];
};

type APIResultV5 = {
  results: APIJobResultV5[];
};

// Make sure that the JSON blob we receive from the API conforms to our flow
// type definition.
function _ensureIsAPIResultV5(result: unknown): APIResultV5 {
  // It's possible (especially when running tests with Jest) that the parameter
  // inherits from a `Object` global from another realm. By using toString
  // this issue is solved wherever the parameter comes from.
  const isObject = (subject: unknown) =>
    Object.prototype.toString.call(subject) === '[object Object]';

  if (!isObject(result) || !('results' in (result as object))) {
    throw new Error('Expected an object with property `results`');
  }
  const results = (result as { results: unknown }).results;
  if (!Array.isArray(results)) {
    throw new Error('Expected `results` to be an array');
  }
  for (const jobResult of results) {
    if (
      !isObject(jobResult) ||
      !('found_modules' in jobResult) ||
      !('stacks' in jobResult)
    ) {
      throw new Error(
        'Expected jobResult to have `found_modules` and `stacks` properties'
      );
    }
    const found_modules = jobResult.found_modules;
    if (!isObject(found_modules)) {
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
        if (!isObject(frameInfo)) {
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
        if (
          'function_offset' in frameInfo &&
          typeof frameInfo.function_offset !== 'string'
        ) {
          throw new Error(
            'Expected frameInfo.function_offset to be a string, if present'
          );
        }
        if (
          'function_size' in frameInfo &&
          typeof frameInfo.function_size !== 'string'
        ) {
          throw new Error(
            'Expected frameInfo.function_size to be a string, if present'
          );
        }
        if ('inlines' in frameInfo) {
          const inlines = frameInfo.inlines;
          if (!Array.isArray(inlines)) {
            throw new Error('Expected `inlines` to be an array');
          }
          for (const inlineFrame of inlines) {
            if (!isObject(inlineFrame)) {
              throw new Error('Expected `inlineFrame` to be an object');
            }
          }
        }
      }
    }
  }
  return result as APIResultV5;
}

function getV5ResultForLibRequest(
  symbolSupplierName: string,
  request: LibSymbolicationRequest,
  addressArray: number[],
  json: APIJobResultV5
): Map<number, AddressResult> {
  const { lib } = request;
  const { debugName, breakpadId } = lib;

  if (!json.found_modules[`${debugName}/${breakpadId}`]) {
    throw new Error(
      `The ${symbolSupplierName} does not have symbols for ${debugName}/${breakpadId}.`
    );
  }

  const addressInfo = json.stacks[0];
  if (addressInfo.length !== addressArray.length) {
    throw new Error(
      `The result from the ${symbolSupplierName} has an unexpected length.`
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

      // Some symbolication API implementations return an inline stack for each
      // address. These are function calls that were inlined into the outer
      // function by the compiler.
      let inlines;
      if (info.inlines !== undefined) {
        const inlineCount = info.inlines.length;
        inlines = info.inlines.map(({ function: name, file, line }, i) => {
          const depth = inlineCount - i;
          return {
            name:
              name ??
              `<unknown at ${info.module_offset} at inline depth ${depth}>`,
            file,
            line,
          };
        });
      }

      let functionSize;
      if (info.function_size !== undefined) {
        functionSize = parseInt(info.function_size.substr(2), 16);
      }

      addressResult = {
        name,
        symbolAddress: address - functionOffset,
        file: info.file,
        line: info.line,
        inlines,
        functionSize,
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
// Returns a promise that resolves to an array LibSymbolicationResponses,
// one response per LibSymbolicationRequest in requests. If the server does
// not have symbol information for a given library, the LibSymbolicationResponse
// for that library will have .type === 'ERROR'.
// `querySymbolicationApiCallback` should be a callback that receives the actual
// request in the Mozilla symbolication API format. See the comment about the
// callback at the top of this file for more details.
export async function requestSymbols(
  symbolSupplierName: string,
  requests: LibSymbolicationRequest[],
  querySymbolicationApiCallback: QuerySymbolicationApiCallback
): Promise<LibSymbolicationResponse[]> {
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

  const responseJson = _ensureIsAPIResultV5(
    await querySymbolicationApiCallback('/symbolicate/v5', JSON.stringify(body))
  );
  return requestsWithAddressArrays.map(
    ({ request, addressArray }, requestIndex) => {
      const json = responseJson.results[requestIndex];
      try {
        const { lib } = request;
        const results = getV5ResultForLibRequest(
          symbolSupplierName,
          request,
          addressArray,
          json
        );
        return { type: 'SUCCESS', lib, results };
      } catch (error) {
        return { type: 'ERROR', request, error };
      }
    }
  );
}
