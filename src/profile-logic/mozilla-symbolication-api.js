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
};

type APIStackV5 = APIFrameInfoV5[];

type APIJobResultV5 = {
  found_modules: APIFoundModulesV5,
  stacks: APIStackV5[],
};

type APIResultV5 = {
  results: APIJobResultV5[],
};

// v6

type APIModuleStatusV6 = Array<{
  found: boolean,
  errors: Array<APIModuleErrorV6>,
  symbol_count: number,
}>;

type APIModuleErrorV6 = {
  name: string,
  message: string,
  filename?: string,
  line?: number,
};

type APIFrameInfoV6 = {
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
  // An array of frames that were inlined into this function at the given address.
  inline_stack: Array<APIInlineStackFrameV6>,
};

type APIInlineStackFrameV6 = {
  function_name?: string,
  file_path?: string,
  line_number?: number,
};

type APIStackV6 = APIFrameInfoV6[];

type APIJobResultV6 = {
  module_status: APIModuleStatusV6,
  stacks: APIStackV6[],
};

type APIResultV6 = {
  results: APIJobResultV6[],
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
      }
    }
  }
  return result;
}

function _ensureIsAPIResultV6(result: any): APIResultV6 {
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
      !('module_status' in jobResult) ||
      !('stacks' in jobResult)
    ) {
      throw new Error(
        'Expected jobResult to have `module_status` and `stacks` properties'
      );
    }
    const module_status = jobResult.module_status;
    if (!Array.isArray(module_status)) {
      throw new Error('Expected `module_status` to be an array');
    }
    for (const moduleStatus of module_status) {
      if (
        !(moduleStatus instanceof Object) ||
        !('found' in moduleStatus) ||
        !('errors' in moduleStatus) ||
        !('symbol_count' in moduleStatus)
      ) {
        throw new Error(
          'Expected moduleStatus to have `found`, `errors` and `symbol_count` properties.'
        );
      }
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
        if ('inline_stack' in frameInfo) {
          const inlineStack = frameInfo.inline_stack;
          if (!Array.isArray(inlineStack)) {
            throw new Error('Expected `inlineStack` to be an array');
          }
          for (const inlineFrame of inlineStack) {
            if (!(inlineFrame instanceof Object)) {
              throw new Error('Expected `inlineFrame` to be an object');
            }
          }
        }
      }
    }
  }
  return result;
}

async function getResultForLibRequestFromV5Response(
  request,
  addressArray,
  json
) {
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
}

async function getResultForLibRequestFromV6Response(
  request,
  addressArray,
  json: APIJobResultV6
) {
  const { lib } = request;
  const { debugName, breakpadId } = lib;

  if (!json.module_status[0].found) {
    const errors = json.module_status[0].errors.map(e => {
      const error = new Error(e.message);
      error.name = e.name;
      error.fileName = e.filename;
      error.lineNumber = e.line;
      return error;
    });
    throw new SymbolsNotFoundError(
      `The symbol server does not have symbols for ${debugName}/${breakpadId}.`,
      lib,
      ...errors
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
}

export type QueryAPICallback = (
  url: string,
  requestJSON: string
) => Promise<Object>;

type ResponseV5OrV6 =
  | {
      type: 'v5',
      result: APIResultV5,
    }
  | {
      type: 'v6',
      result: APIResultV6,
    };

async function queryAPIAndTypeCheckResult(
  queryAPICallback: QueryAPICallback,
  body: Object
) {
  try {
    const json = await queryAPICallback(
      '/symbolicate/v6a1',
      JSON.stringify(body)
    );
    return { type: 'v6', result: _ensureIsAPIResultV6(json) };
  } catch (error) {
    try {
      const json = await queryAPICallback(
        '/symbolicate/v5',
        JSON.stringify(body)
      );
      return { type: 'v5', result: _ensureIsAPIResultV5(json) };
    } catch (error) {
      throw new Error(
        `There was a problem with the JSON returned by the symbolication API: ${error}.`
      );
    }
  }
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
  symbolsUrl: string,
  queryAPICallback?: QueryAPICallback
): Array<Promise<Map<number, AddressResult>>> {
  // For each request, turn its set of addresses into an array.
  // We need there to be a defined order in each addressArray so that we can
  // match the results to the request.
  const requestsWithAddressArrays = requests.map(request => ({
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
        stacks: [addressArray.map(addr => [0, addr])],
      };
    }),
  };

  if (!queryAPICallback) {
    queryAPICallback = async (url, requestJSON) => {
      const response = await fetch(symbolsUrl + url, {
        body: requestJSON,
        method: 'POST',
        mode: 'cors',
      });
      return response.json();
    };
  }

  const apiResultPromise = queryAPIAndTypeCheckResult(queryAPICallback, body);

  return requestsWithAddressArrays.map(async ({ request, addressArray }, i) => {
    const response: ResponseV5OrV6 = await apiResultPromise;
    if (response.type === 'v6') {
      const jobResult = response.result.results[i];
      return getResultForLibRequestFromV6Response(
        request,
        addressArray,
        jobResult
      );
    }
    const jobResult = response.result.results[i];
    return getResultForLibRequestFromV5Response(
      request,
      addressArray,
      jobResult
    );
  });
}
