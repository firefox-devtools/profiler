/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { assertExhaustiveCheck } from './flow';
import {
  NativeSymbolInfo,
  Lib,
  MixedObject,
} from 'firefox-profiler/types';
import { ApiQueryError, DecodedInstruction } from 'firefox-profiler/types/state';
import { queryApiWithFallback } from './query-api';
import { ExternalCommunicationDelegate } from './query-api';
import { isLocalURL } from './url';

export type FetchAssemblyResult =
  | { type: 'SUCCESS'; instructions: DecodedInstruction[] }
  | { type: 'ERROR'; errors: ApiQueryError[] };

/**
 * Fetch a native function's assembly instructions, using the symbolication
 * API /asm/v1, targeting either the browser symbolication API or a symbol server.
 */
export async function fetchAssembly(
  nativeSymbolInfo: NativeSymbolInfo,
  lib: Lib,
  symbolServerUrl: string,
  delegate: ExternalCommunicationDelegate
): Promise<FetchAssemblyResult> {
  // Make a request to /asm/v1. The API format for this endpoint is documented
  // at https://github.com/mstange/samply/blob/main/API.md#asmv1
  const symbolServerUrlForFallback = _serverMightSupportAssembly(
    symbolServerUrl
  )
    ? symbolServerUrl
    : null;

  const { debugName, breakpadId, name, codeId } = lib;
  const { address } = nativeSymbolInfo;

  const queryResult = await queryApiWithFallback(
    '/asm/v1',
    JSON.stringify({
      debugName,
      debugId: breakpadId,
      name,
      codeId,
      startAddress: `0x${address.toString(16)}`,
      size: `0x${nativeSymbolInfo.functionSize.toString(16)}`,
      continueUntilFunctionEnd: !nativeSymbolInfo.functionSizeIsKnown,
    }),
    symbolServerUrlForFallback,
    delegate,
    convertJsonInstructions
  );

  switch (queryResult.type) {
    case 'SUCCESS':
      return {
        type: 'SUCCESS',
        instructions: queryResult.convertedResponse,
      };
    case 'ERROR': {
      return { type: 'ERROR', errors: queryResult.errors };
    }
    default:
      throw assertExhaustiveCheck(queryResult, 'queryResult.type');
  }
}

// At the moment, the official Mozilla symbolication server does not have an
// endpoint for requesting assembly code. The /asm/v1 URL is only supported by
// local symbol servers. Check the symbol server URL to avoid hammering the
// official Mozilla symbolication server with requests it can't handle.
// This check can be removed once it adds support for /asm/v1.
function _serverMightSupportAssembly(symbolServerUrl: string): boolean {
  return isLocalURL(symbolServerUrl);
}

// Convert the response from the JSON format into our own DecodedInstruction
// format. The JSON format uses relative offsets to the start address for each
// instruction, and DecodedInstruction has the resolved address.
//
// We currently discard a fair amount of information. We'll consume the rest of
// the information once we have UI which uses it.
function convertJsonInstructions(
  responseJSON: MixedObject
): DecodedInstruction[] {
  if (!responseJSON.startAddress) {
    throw new Error('Missing startAddress field in asm response');
  }
  if (!responseJSON.instructions) {
    throw new Error('Missing instructions field in asm response');
  }
  if (!Array.isArray(responseJSON.instructions)) {
    throw new Error('The instructions field in asm response is not an array');
  }
  const { startAddress, instructions } = responseJSON;
  const startAddressNum = parseInt(startAddress as string, 16);
  if (isNaN(startAddressNum)) {
    throw new Error('Invalid startAddress value in asm response');
  }
  return instructions.map((instructionData: unknown) => {
    if (!Array.isArray(instructionData)) {
      throw new Error('Invalid instruction data (not an array)');
    }
    if (instructionData.length < 2) {
      throw new Error('Invalid instruction data (< 2 elements)');
    }
    const [offset, decodedString] = instructionData;
    if (typeof offset !== 'number') {
      throw new Error('Invalid instruction offset');
    }
    if (typeof decodedString !== 'string') {
      throw new Error('Invalid instruction decodedString value');
    }
    return {
      address: startAddressNum + offset,
      decodedString,
    };
  });
}