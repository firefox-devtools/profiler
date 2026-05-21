/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfile } from 'firefox-profiler/selectors/profile';
import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { parseFunctionHandle } from './function-map';
import { getLibForFunc } from './function-list';
import type { ThreadMap } from './thread-map';
import {
  getStackLineInfo,
  getLineTimings,
} from 'firefox-profiler/profile-logic/line-timings';
import {
  getStackAddressInfo,
  getAddressTimings,
} from 'firefox-profiler/profile-logic/address-timings';
import {
  getNativeSymbolInfo,
  getNativeSymbolsForFunc,
  findAddressProofForFile,
} from 'firefox-profiler/profile-logic/profile-data';
import { fetchAssembly } from 'firefox-profiler/utils/fetch-assembly';
import { fetchSource } from 'firefox-profiler/utils/fetch-source';
import type { ExternalCommunicationDelegate } from 'firefox-profiler/utils/query-api';
import type {
  Profile,
  IndexIntoFuncTable,
  IndexIntoNativeSymbolTable,
  Thread,
} from 'firefox-profiler/types';
import type {
  FunctionAnnotateResult,
  AnnotateMode,
  FunctionAsmAnnotation,
  SourceAnnotationResult,
  AsmAnnotationsResult,
} from './types';
import type { Store } from '../types/store';

class NodeExternalCommunicationDelegate implements ExternalCommunicationDelegate {
  async fetchUrlResponse(url: string, postData?: string): Promise<Response> {
    const init: RequestInit =
      postData !== undefined ? { method: 'POST', body: postData } : {};
    return fetch(url, init);
  }

  async queryBrowserSymbolicationApi(
    _path: string,
    _requestJson: string
  ): Promise<string> {
    throw new Error('No browser connection available in profiler-cli');
  }

  async fetchJSSourceFromBrowser(_source: string): Promise<string> {
    throw new Error('No browser connection available in profiler-cli');
  }
}

const nodeDelegate = new NodeExternalCommunicationDelegate();

async function fetchSourceAnnotation(
  funcIndex: IndexIntoFuncTable,
  functionHandle: string,
  mode: AnnotateMode,
  thread: Thread,
  profile: Profile,
  symbolServerUrl: string,
  archiveCache: Map<string, Promise<Uint8Array>>,
  contextOption: string
): Promise<SourceAnnotationResult> {
  const warnings: string[] = [];
  const sourceIndex = profile.shared.funcTable.source[funcIndex];
  if (sourceIndex === null) {
    if (mode === 'src') {
      warnings.push(
        `Function ${functionHandle} has no source index. Use --mode asm for assembly view.`
      );
    }
    return { annotation: null, warnings };
  }

  const {
    stackTable,
    frameTable,
    funcTable: threadFuncTable,
    samples,
  } = thread;
  const filename = thread.stringTable.getString(
    thread.sources.filename[sourceIndex]
  );
  const sourceUuid = thread.sources.id[sourceIndex];

  const stackLineInfo = getStackLineInfo(
    stackTable,
    frameTable,
    threadFuncTable,
    sourceIndex
  );
  const { totalLineHits, selfLineHits } = getLineTimings(
    stackLineInfo,
    samples
  );

  let samplesWithFunction = 0;
  let samplesWithLineInfo = 0;
  for (let si = 0; si < samples.length; si++) {
    const stackIndex = samples.stack[si];
    if (stackIndex === null) {
      continue;
    }
    const lineSetIndex = stackLineInfo.stackIndexToLineSetIndex[stackIndex];
    if (lineSetIndex === -1) {
      continue;
    }
    const weight = samples.weight ? samples.weight[si] : 1;
    samplesWithFunction += weight;
    if (stackLineInfo.lineSetTable.self[lineSetIndex] !== -1) {
      samplesWithLineInfo += weight;
    }
  }

  const addressProof = findAddressProofForFile(profile, sourceIndex);

  let fileLines: string[] | null = null;
  let totalFileLines: number | null = null;
  const fetchResult = await fetchSource(
    filename,
    sourceUuid,
    symbolServerUrl,
    addressProof,
    archiveCache,
    nodeDelegate
  );
  if (fetchResult.type === 'SUCCESS') {
    fileLines = fetchResult.source.split('\n');
    totalFileLines = fileLines.length;
  } else {
    const errorMessages = fetchResult.errors
      .map((e) => JSON.stringify(e))
      .join('; ');
    warnings.push(`Could not fetch source for ${filename}: ${errorMessages}`);
  }

  const annotatedLineNums = new Set([
    ...totalLineHits.keys(),
    ...selfLineHits.keys(),
  ]);
  let linesToShow: Set<number>;
  let contextMode: string;

  if (contextOption === 'file') {
    linesToShow = new Set<number>();
    const last = totalFileLines ?? Math.max(...annotatedLineNums);
    for (let ln = 1; ln <= last; ln++) {
      linesToShow.add(ln);
    }
    contextMode = 'full file';
  } else {
    const parsed = parseInt(contextOption, 10);
    const context = Math.max(0, isNaN(parsed) ? 2 : parsed);
    linesToShow = new Set<number>();
    for (const ln of annotatedLineNums) {
      for (let ctx = Math.max(1, ln - context); ctx <= ln + context; ctx++) {
        linesToShow.add(ctx);
      }
    }
    contextMode =
      context === 0 ? 'annotated lines only' : `±${context} lines context`;
  }

  const sortedLines = Array.from(linesToShow).sort((a, b) => a - b);
  return {
    annotation: {
      filename,
      totalFileLines,
      samplesWithFunction,
      samplesWithLineInfo,
      contextMode,
      lines: sortedLines.map((ln) => ({
        lineNumber: ln,
        selfSamples: selfLineHits.get(ln) ?? 0,
        totalSamples: totalLineHits.get(ln) ?? 0,
        sourceText: fileLines !== null ? (fileLines[ln - 1] ?? null) : null,
      })),
    },
    warnings,
  };
}

async function fetchAsmAnnotations(
  functionHandle: string,
  nativeSymbolsForFunc: Set<IndexIntoNativeSymbolTable>,
  thread: Thread,
  profile: Profile,
  symbolServerUrl: string
): Promise<AsmAnnotationsResult> {
  const warnings: string[] = [];

  if (nativeSymbolsForFunc.size === 0) {
    warnings.push(
      `Function ${functionHandle} has no native symbols — may be JS-only or not symbolicated.`
    );
  }

  const {
    stackTable,
    frameTable,
    funcTable: threadFuncTable,
    samples,
  } = thread;
  const nativeSymbolCount = nativeSymbolsForFunc.size;

  const results = await Promise.all(
    Array.from(nativeSymbolsForFunc).map(async (nsIndex) => {
      const nativeSymbolInfo = getNativeSymbolInfo(
        nsIndex,
        thread.nativeSymbols,
        frameTable,
        thread.stringTable
      );
      const lib = profile.libs[nativeSymbolInfo.libIndex];

      const stackAddressInfo = getStackAddressInfo(
        stackTable,
        frameTable,
        threadFuncTable,
        nsIndex
      );
      const { totalAddressHits, selfAddressHits } = getAddressTimings(
        stackAddressInfo,
        samples
      );

      let fetchError: string | null = null;
      let instructions: FunctionAsmAnnotation['instructions'] = [];
      const localWarnings: string[] = [];

      try {
        const fetchResult = await fetchAssembly(
          nativeSymbolInfo,
          lib,
          symbolServerUrl,
          nodeDelegate
        );
        if (fetchResult.type === 'SUCCESS') {
          instructions = fetchResult.instructions.map((instr) => ({
            address: instr.address,
            selfSamples: selfAddressHits.get(instr.address) ?? 0,
            totalSamples: totalAddressHits.get(instr.address) ?? 0,
            decodedString: instr.decodedString,
          }));
        } else {
          fetchError = fetchResult.errors
            .map((e) => JSON.stringify(e))
            .join('; ');
          localWarnings.push(
            `Assembly fetch failed for ${nativeSymbolInfo.name}: ${fetchError}`
          );
        }
      } catch (e) {
        fetchError = e instanceof Error ? e.message : String(e);
        localWarnings.push(
          `Assembly fetch threw for ${nativeSymbolInfo.name}: ${fetchError}`
        );
      }

      return {
        symbolName: nativeSymbolInfo.name,
        symbolAddress: nativeSymbolInfo.address,
        functionSize: nativeSymbolInfo.functionSizeIsKnown
          ? nativeSymbolInfo.functionSize
          : null,
        fetchError,
        instructions,
        localWarnings,
      };
    })
  );

  const annotations: FunctionAsmAnnotation[] = [];
  results.forEach((r, i) => {
    warnings.push(...r.localWarnings);
    annotations.push({
      compilationIndex: i + 1,
      symbolName: r.symbolName,
      symbolAddress: r.symbolAddress,
      functionSize: r.functionSize,
      nativeSymbolCount,
      fetchError: r.fetchError,
      instructions: r.instructions,
    });
  });

  return { annotations, warnings };
}

export async function functionAnnotate(
  store: Store,
  threadMap: ThreadMap,
  archiveCache: Map<string, Promise<Uint8Array>>,
  functionHandle: string,
  mode: AnnotateMode,
  symbolServerUrl: string,
  contextOption: string
): Promise<FunctionAnnotateResult> {
  const state = store.getState();
  const profile = getProfile(state);
  const { funcTable, stringArray, resourceTable } = profile.shared;

  const funcIndex = parseFunctionHandle(functionHandle, funcTable.length);
  const funcName = stringArray[funcTable.name[funcIndex]];

  const libraryName = getLibForFunc(
    funcIndex,
    funcTable,
    resourceTable,
    profile.libs
  )?.name;
  const fullName = libraryName ? `${libraryName}!${funcName}` : funcName;

  const threadIndexes = getSelectedThreadIndexes(state);
  const threadSelectors = getThreadSelectors(threadIndexes);
  const thread = threadSelectors.getFilteredThread(state);

  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const threadHandle = threadMap.handleForThreadIndexes(threadIndexes);

  const nativeSymbolsForFunc = getNativeSymbolsForFunc(
    funcIndex,
    thread.frameTable
  );

  const { funcSelf, funcTotal } = threadSelectors.getFunctionListTimings(state);
  const totalSelfSamples = funcSelf[funcIndex];
  const totalTotalSamples = funcTotal[funcIndex];

  const srcPromise: Promise<SourceAnnotationResult> =
    mode === 'src' || mode === 'all'
      ? fetchSourceAnnotation(
          funcIndex,
          functionHandle,
          mode,
          thread,
          profile,
          symbolServerUrl,
          archiveCache,
          contextOption
        )
      : Promise.resolve({ annotation: null, warnings: [] });

  const asmPromise: Promise<AsmAnnotationsResult> =
    mode === 'asm' || mode === 'all'
      ? fetchAsmAnnotations(
          functionHandle,
          nativeSymbolsForFunc,
          thread,
          profile,
          symbolServerUrl
        )
      : Promise.resolve({ annotations: [], warnings: [] });

  const [
    { annotation: srcAnnotation, warnings: srcWarnings },
    { annotations: asmAnnotations, warnings: asmWarnings },
  ] = await Promise.all([srcPromise, asmPromise]);

  return {
    type: 'function-annotate',
    functionHandle,
    funcIndex,
    name: funcName,
    fullName,
    threadHandle,
    friendlyThreadName,
    totalSelfSamples,
    totalTotalSamples,
    mode,
    srcAnnotation,
    asmAnnotations,
    warnings: [...srcWarnings, ...asmWarnings],
  };
}
