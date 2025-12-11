/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as v from 'valibot';
import type {
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

// Valibot schemas for API response validation

// For every requested library in the memoryMap, this object contains a string
// key of the form `${debugName}/${breakpadId}`. The value is null if no
// address with the module index was requested, and otherwise a boolean that
// says whether the symbol server had symbols for this library.
const APIFoundModulesV5Schema = v.record(v.string(), v.nullable(v.boolean()));

// Information about functions that were inlined at this address.
const APIInlineFrameInfoV5Schema = v.object({
  // The name of the function this inline frame was in, if known.
  function: v.optional(v.string()),
  // The path of the file that contains the function this inline frame was in, optional.
  file: v.optional(v.string()),
  // The line number that contains the source code for this inline frame that
  // contributed to the instruction at the looked-up address, optional.
  // e.g. 543
  line: v.optional(v.number()),
});

const APIFrameInfoV5Schema = v.object({
  // The hex version of the address that we requested (e.g. "0x5ab").
  module_offset: v.string(),
  // The debugName of the library that this frame was in.
  module: v.string(),
  // The index of this APIFrameInfo in its enclosing APIStack.
  frame: v.number(),
  // The name of the function this frame was in, if symbols were found.
  function: v.optional(v.string()),
  // The hex offset between the requested address and the start of the function,
  // e.g. "0x3c".
  function_offset: v.optional(v.string()),
  // An optional size, in bytes, of the machine code of the outer function that
  // this address belongs to, as a hex string, e.g. "0x270".
  function_size: v.optional(v.string()),
  // The path of the file that contains the function this frame was in, optional.
  file: v.optional(v.string()),
  // The line number that contains the source code that generated the instructions at the address, optional.
  line: v.optional(v.number()),
  // Information about functions that were inlined at this address.
  // Ordered from inside to outside.
  inlines: v.optional(v.array(APIInlineFrameInfoV5Schema)),
});

const APIStackV5Schema = v.array(APIFrameInfoV5Schema);

const APIJobResultV5Schema = v.object({
  found_modules: APIFoundModulesV5Schema,
  stacks: v.array(APIStackV5Schema),
});

const APIResultV5Schema = v.object({
  results: v.array(APIJobResultV5Schema),
});

type APIJobResultV5 = v.InferOutput<typeof APIJobResultV5Schema>;
type APIResultV5 = v.InferOutput<typeof APIResultV5Schema>;

// Make sure that the JSON blob we receive from the API conforms to our
// type definition using valibot validation.
function _ensureIsAPIResultV5(result: unknown): APIResultV5 {
  return v.parse(APIResultV5Schema, result);
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

  const results = new Map<number, AddressResult>();
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
