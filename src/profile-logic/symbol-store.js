/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import SymbolStoreDB from './symbol-store-db';
import { SymbolsNotFoundError } from './errors';

import type { RequestedLib, ISymbolStoreDB } from 'firefox-profiler/types';
import type { SymbolTableAsTuple } from './symbol-store-db';
import { ensureExists } from '../utils/flow';

import { bisectionRight } from 'firefox-profiler/utils/bisect';

export type LibSymbolicationRequest = {
  lib: RequestedLib,
  addresses: Set<number>,
};

export type LibSymbolicationResponse =
  | {
      type: 'SUCCESS',
      lib: RequestedLib,
      results: Map<number, AddressResult>,
    }
  | {
      type: 'ERROR',
      request: LibSymbolicationRequest,
      error: Error,
    };

export type AddressResult = {
  // The name of the outer function that this address belongs to.
  name: string,
  // The address (relative to the library) where the function that
  // contains this address starts, i.e. the address of the function symbol.
  symbolAddress: number,
  // The path of the file that contains the source code of the outer function that contains
  // this address.
  // Optional because the information may not be known by the symbolication source, or because
  // the symbolication method does not expose it.
  file?: string,
  // The line number that contains the source code of the outer function that generated the
  // instructions at the address, optional.
  // Optional because the information may not be known by the symbolication source, or because
  // the symbolication method does not expose it.
  line?: number,
  // An optional inline callstack, ordered from inside to outside.
  // addressResult.name calls addressResult.inlines[inlines.length - 1].function, which
  // calls addressResult.inlines[inlines.length - 2].function etc.
  inlines?: Array<AddressInlineFrame>,
  // An optional size, in bytes, of the machine code of the outer function that
  // this address belongs to.
  functionSize?: number,
};

export type AddressInlineFrame = {
  name: string,
  file?: string,
  line?: number,
};

interface SymbolProvider {
  // Cheap, should be called first.
  requestSymbolsFromServer(
    requests: LibSymbolicationRequest[]
  ): Promise<LibSymbolicationResponse[]>;

  // Expensive, should be called if requestSymbolsFromServer was unsuccessful.
  requestSymbolsFromBrowser(
    requests: LibSymbolicationRequest[]
  ): Promise<LibSymbolicationResponse[]>;

  // Expensive, should be called if the other two options were unsuccessful.
  // Does not carry file + line + inlines information.
  requestSymbolTableFromBrowser(lib: RequestedLib): Promise<SymbolTableAsTuple>;
}

export interface AbstractSymbolStore {
  getSymbols(
    requests: LibSymbolicationRequest[],
    successCb: (RequestedLib, Map<number, AddressResult>) => void,
    errorCb: (LibSymbolicationRequest, Error) => void,
    ignoreCache?: boolean
  ): Promise<void>;
}

// The Mozilla symbolication API has a limit of 10 jobs per request, so limit
// the number of libraries we request in each chunk to that same number.
const MAX_JOB_COUNT_PER_CHUNK = 10;

// Look up the symbols for the given addresses in the symbol table.
// The symbol table is given in the [addrs, index, buffer] format.
// This format is documented at the SymbolTableAsTuple flow type definition.
export function readSymbolsFromSymbolTable(
  addresses: Set<number>,
  symbolTable: SymbolTableAsTuple,
  demangleCallback: (string) => string
): Map<number, AddressResult> {
  const [symbolTableAddrs, symbolTableIndex, symbolTableBuffer] = symbolTable;
  const addressArray = Uint32Array.from(addresses);
  addressArray.sort();

  // Iterate over all addresses in addressArray and look them up in the
  // symbolTableAddrs array. The index at which a match is found can be used
  // to obtain the start and end position of its string in the buffer, using
  // the symbolTableIndex array.
  // Both addressArray and symbolTableAddrs are sorted in ascending order.
  const decoder = new TextDecoder();
  const results = new Map();
  let currentSymbolIndex = undefined;
  let currentSymbol = '';
  let currentSymbolFunctionSize = undefined;
  for (let i = 0; i < addressArray.length; i++) {
    const address = addressArray[i];

    // Look up address in symbolTableAddrs. symbolTableAddrs is sorted, so we
    // can do the lookup using bisection. And address is >= the previously
    // looked up address, so we can use the last found index as a lower bound
    // during the bisection.
    // We're not looking for an exact match here. We're looking for the
    // largest symbolIndex for which symbolTableAddrs[symbolIndex] <= address.
    // bisection() returns the insertion index, which is one position after
    // the index that we consider the match, so we need to subtract 1 from the
    // result.
    const symbolIndex =
      bisectionRight(symbolTableAddrs, address, currentSymbolIndex) - 1;

    if (symbolIndex >= 0) {
      if (symbolIndex !== currentSymbolIndex) {
        // Get the corresponding string from symbolTableBuffer. The start and
        // end positions are recorded in symbolTableIndex.
        const startOffset = symbolTableIndex[symbolIndex];
        const endOffset = symbolTableIndex[symbolIndex + 1];
        const subarray = symbolTableBuffer.subarray(startOffset, endOffset);
        // C++ or rust symbols in the symbol table may have mangled names.
        // Demangle them here.
        currentSymbol = demangleCallback(decoder.decode(subarray));
        currentSymbolFunctionSize =
          symbolIndex < symbolTableAddrs.length - 1
            ? symbolTableAddrs[symbolIndex + 1] - symbolTableAddrs[symbolIndex]
            : undefined;
        currentSymbolIndex = symbolIndex;
      }
      results.set(address, {
        symbolAddress: symbolTableAddrs[symbolIndex],
        name: currentSymbol,
        functionSize: currentSymbolFunctionSize,
      });
    } else {
      results.set(address, {
        symbolAddress: 0,
        name: '<before first symbol>',
      });
    }
  }
  return results;
}

// Partition the array into "chunks".
// Every element in the array is assigned a numeric value using the computeValue
// callback function. The chunks are chosen in such a way that the accumulated
// value in each chunk does not exceed maxValue, if possible.
// In other words, for each chunk, the following will hold:
// sum(chunk.map(computeValue)) <= maxValue or chunk.length == 1.
// The array is allowed to contain elements which are larger than the maximum
// value on their own; such elements will get a single chunk for themselves.
// Additionally, each chunk is limited to contain no more than maxChunkLength
// elements.
function _partitionIntoChunksOfMaxValue<T>(
  array: T[],
  maxValue: number,
  maxChunkLength: number,
  computeValue: (T) => number
): T[][] {
  const chunks = [];
  for (const element of array) {
    const elementValue = computeValue(element);
    // Find an existing chunk that still has enough "value space" left to
    // accomodate this element.
    let chunk = chunks.find(
      ({ value, elements }) =>
        value + elementValue <= maxValue &&
        elements.length + 1 <= maxChunkLength
    );
    if (chunk === undefined) {
      // If no chunk was found, create a new chunk.
      chunk = { value: 0, elements: [] };
      chunks.push(chunk);
    }
    chunk.elements.push(element);
    chunk.value += elementValue;
  }
  return chunks.map(({ elements }) => elements);
}

type DemangleFunction = (string) => string;

/**
 * This function returns a function that can demangle function name using a
 * WebAssembly module, but falls back on the identity function if the
 * WebAssembly module isn't available for some reason.
 */
async function _getDemangleCallback(): Promise<DemangleFunction> {
  try {
    // When this module imports some WebAssembly module, Webpack's mechanism
    // invokes the WebAssembly object which might be absent in some browsers,
    // therefore `import` can throw. Also some browsers might refuse to load a
    // wasm module because of our CSP.
    // See webpack bug https://github.com/webpack/webpack/issues/8517
    const { demangle_any } = await import('gecko-profiler-demangle');
    return demangle_any;
  } catch (error) {
    // Module loading can fail (for example in browsers without WebAssembly
    // support, or due to bad server configuration), so we will fall back
    // to a pass-through function if that happens.
    console.error('Demangling module could not be imported.', error);
    return (mangledString) => mangledString;
  }
}

/**
 * The SymbolStore implements efficient lookup of symbols for a set of addresses.
 * It consults multiple sources of symbol information and caches some results.
 * It only implements one public method: getSymbols.
 * @class SymbolStore
 */
export class SymbolStore {
  _symbolProvider: SymbolProvider;
  _db: ISymbolStoreDB;

  constructor(
    dbNamePrefixOrDB: string | ISymbolStoreDB,
    symbolProvider: SymbolProvider
  ) {
    this._symbolProvider = symbolProvider;
    if (typeof dbNamePrefixOrDB === 'string') {
      this._db = new SymbolStoreDB(`${dbNamePrefixOrDB}-symbol-tables`);
    } else {
      this._db = dbNamePrefixOrDB;
    }
  }

  async closeDb() {
    await this._db.close();
  }

  // Store a symbol table in the database. This is only used for symbol tables
  // and not for partial symbol results. Symbol tables are obtained from the
  // browser via the geckoProfiler object which is defined in a frame script:
  // https://searchfox.org/mozilla-central/rev/a9db89754fb507254cb8422e5a00af7c10d98264/devtools/client/performance-new/frame-script.js#67-81
  //
  // We do not store results from the Mozilla symbolication API, because those
  // only contain the symbols we requested and not all the symbols of a given
  // library.
  _storeSymbolTableInDB(
    lib: RequestedLib,
    symbolTable: SymbolTableAsTuple
  ): Promise<void> {
    return this._db
      .storeSymbolTable(lib.debugName, lib.breakpadId, symbolTable)
      .catch((error) => {
        console.log(
          `Failed to store the symbol table for ${lib.debugName} in the database:`,
          error
        );
      });
  }

  /**
   * Look up symbols for the given addresses in the given libraries.
   * For each LibSymbolicationRequest in requests, either errorCb or successCb
   * will be called.
   * This method returns a promise that resolves when the callbacks for all
   * requests have been called.
   */
  async getSymbols(
    requests: LibSymbolicationRequest[],
    successCb: (RequestedLib, Map<number, AddressResult>) => void,
    errorCb: (LibSymbolicationRequest, Error) => void,
    ignoreCache: boolean = false
  ): Promise<void> {
    // For each library, we have three options to obtain symbol information for
    // it. We try all options in order, advancing to the next option on failure.
    // Option 1: Symbol tables cached in the database, this._db.
    // Option 2: Obtain symbols from the symbol server.
    // Option 3: Obtain symbols from the browser, using the symbolication API.
    // Option 4: Obtain symbols from the browser, via individual symbol tables.

    // Check requests for validity first.
    requests = requests.filter((request) => {
      const { debugName, breakpadId } = request.lib;
      if (debugName === '' || breakpadId === '') {
        errorCb(
          request,
          new SymbolsNotFoundError(
            `Failed to symbolicate library ${debugName}/${breakpadId}`,
            request.lib,
            new Error('Invalid debugName or breakpadId')
          )
        );
        return false;
      }
      return true;
    });

    // First, try option 1 for all libraries and partition them by whether it
    // was successful.
    const requestsForNonCachedLibs = [];
    const resultsForCachedLibs = [];
    if (ignoreCache) {
      requestsForNonCachedLibs.push(...requests);
    } else {
      await Promise.all(
        requests.map(async (request) => {
          const { lib, addresses } = request;
          const { debugName, breakpadId } = lib;
          try {
            // Try to get the symbol table from the database.
            // This call will throw if the symbol table is not present.
            const symbolTable = await this._db.getSymbolTable(
              debugName,
              breakpadId
            );

            // Did not throw, option 1 was successful!
            resultsForCachedLibs.push({
              lib,
              addresses,
              symbolTable,
            });
          } catch (e) {
            if (!(e instanceof SymbolsNotFoundError)) {
              // rethrow JavaScript programming error
              throw e;
            }
            requestsForNonCachedLibs.push(request);
          }
        })
      );
    }

    // First phase of option 2:
    // Try to service requestsForNonCachedLibs using the symbolication API,
    // requesting chunks of max 10000 addresses each. In reality, this usually
    // means that all addresses for libxul get processed in one chunk, and the
    // addresses from all other libraries get processed in a second chunk.
    // The driving idea behind this is to minimize latency: If symbolication for
    // all libraries is blocked on getting symbols for libxul, latency suffers.
    // On the other hand, if we fire off a separate request for each library,
    // latency also suffers because of per-request overhead and pipelining limits.
    // We also limit each chunk to at most MAX_JOB_COUNT_PER_CHUNK libraries.
    const chunks = _partitionIntoChunksOfMaxValue(
      requestsForNonCachedLibs,
      10000,
      MAX_JOB_COUNT_PER_CHUNK,
      ({ addresses }) => addresses.size
    );

    // Kick off the requests to the symbolication API, and create a list of
    // promises, one promise per chunk.
    const symbolicationApiRequestsAndResponsesPerChunk: Array<
      [LibSymbolicationRequest[], Promise<LibSymbolicationResponse[]>],
    > = chunks.map((requests) => [
      requests,
      this._symbolProvider.requestSymbolsFromServer(requests),
    ]);

    // Finalize requests for which option 1 was successful:
    // Now that the requests to the server have been kicked off, process
    // symbolication for the libraries for which we found symbol tables in the
    // database. This is delayed until after the request has been kicked off
    // because it can take some time.

    // We also need a demangling function for this, which is in an async module.
    const demangleCallback = await _getDemangleCallback();

    for (const { lib, addresses, symbolTable } of resultsForCachedLibs) {
      successCb(
        lib,
        readSymbolsFromSymbolTable(addresses, symbolTable, demangleCallback)
      );
    }

    // Process the results from the symbolication API request, as they arrive.
    // For unsuccessful requests, fall back to _getSymbolsFromBrowser.
    await Promise.all(
      symbolicationApiRequestsAndResponsesPerChunk.map(
        async ([option2Requests, option2ResponsePromise]) => {
          // Store any errors encountered along the way in this map.
          // We will report them if all avenues fail.
          const errorMap: Map<LibSymbolicationRequest, Error[]> = new Map(
            requests.map((r) => [r, []])
          );

          // Process the results of option 2: The response from the Mozilla symbolication APi.
          const option3Requests =
            await this._processSuccessfulResponsesAndReturnRemaining(
              option2Requests,
              option2ResponsePromise,
              errorMap,
              successCb
            );

          if (option3Requests.length === 0) {
            // Done!
            return;
          }

          // Some libraries are still remaining, try option 3 for them.
          // Option 3 is symbolProvider.requestSymbolsFromBrowser.
          const option3ResponsePromise =
            this._symbolProvider.requestSymbolsFromBrowser(option3Requests);
          const option4Requests =
            await this._processSuccessfulResponsesAndReturnRemaining(
              option3Requests,
              option3ResponsePromise,
              errorMap,
              successCb
            );

          if (option4Requests.length === 0) {
            // Done!
            return;
          }

          // Some libraries are still remaining, try option 4 for them.
          // Option 4 is symbolProvider.requestSymbolTableFromBrowser.
          await this._getSymbolTablesFromBrowser(
            option4Requests,
            errorMap,
            demangleCallback,
            successCb,
            errorCb
          );
        }
      )
    );
  }

  // This method awaits `responsesPromise`. All successful responses are forwarded
  // to successCb.
  // Returns any requests which were not successful.
  // Mutates errorMap by adding the error that was encountered for a failed request.
  async _processSuccessfulResponsesAndReturnRemaining(
    requests: LibSymbolicationRequest[],
    responsesPromise: Promise<LibSymbolicationResponse[]>,
    errorMap: Map<LibSymbolicationRequest, Error[]>,
    successCb: (RequestedLib, Map<number, AddressResult>) => void
  ): Promise<LibSymbolicationRequest[]> {
    try {
      const responses: LibSymbolicationResponse[] = await responsesPromise;

      const failedRequests = [];
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        if (response.type === 'SUCCESS') {
          // We've found symbols for this library!
          const { lib, results } = response;
          successCb(lib, results);
        } else {
          // No symbols for this library, it'll need to try the next option.
          const { request, error } = response;
          failedRequests.push(request);
          // Put the error into the errorMap.
          ensureExists(errorMap.get(request)).push(error);
        }
      }
      return failedRequests;
    } catch (error) {
      // There was a problem for the entire chunk of requests, for example there
      // might have been a problem parsing the response JSON.
      // Add this error for all requests.
      for (const request of requests) {
        ensureExists(errorMap.get(request)).push(error);
      }
      return requests;
    }
  }

  // Try to get individual symbol tables from the browser, for any libraries
  // which couldn't be symbolicated with the symbolication API.
  // This is needed for two cases:
  //  1. Firefox 95 and earlier, which didn't have a querySymbolicationApi
  //     WebChannel access point, and only supports symbol tables.
  //  2. Android system libraries, even in modern versions of Firefox. We don't
  //     support querySymbolicationApi for them yet, see
  //     https://bugzilla.mozilla.org/show_bug.cgi?id=1735897
  async _getSymbolTablesFromBrowser(
    requests: LibSymbolicationRequest[],
    errorMap: Map<LibSymbolicationRequest, Error[]>,
    demangleCallback: DemangleFunction,
    successCb: (RequestedLib, Map<number, AddressResult>) => void,
    errorCb: (LibSymbolicationRequest, Error) => void
  ): Promise<void> {
    for (const request of requests) {
      const { lib, addresses } = request;
      try {
        // Option 4: Request a symbol table from the browser.
        // This call will throw if the browser cannot obtain the symbol table.
        const symbolTable =
          await this._symbolProvider.requestSymbolTableFromBrowser(lib);

        // Did not throw, option 4 was successful!
        successCb(
          lib,
          readSymbolsFromSymbolTable(addresses, symbolTable, demangleCallback)
        );

        // Store the symbol table in the database.
        await this._storeSymbolTableInDB(lib, symbolTable);
      } catch (lastError) {
        // None of the symbolication methods were successful.
        // Call the error callback with all accumulated errors.
        errorCb(
          request,
          new SymbolsNotFoundError(
            `Could not obtain symbols for ${lib.debugName}/${lib.breakpadId}.`,
            lib,
            ...(errorMap.get(request) ?? []),
            lastError
          )
        );
      }
    }
  }
}
