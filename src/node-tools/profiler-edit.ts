/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import minimist from 'minimist';

import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';
import { compress } from 'firefox-profiler/utils/gz';
import { insertStackLabels } from 'firefox-profiler/profile-logic/insert-stack-labels';
import { SymbolStore } from 'firefox-profiler/profile-logic/symbol-store';
import {
  symbolicateProfile,
  applySymbolicationSteps,
} from 'firefox-profiler/profile-logic/symbolication';
import type { SymbolicationStepInfo } from 'firefox-profiler/profile-logic/symbolication';
import * as MozillaSymbolicationAPI from 'firefox-profiler/profile-logic/mozilla-symbolication-api';
import {
  applyWasmSymbolication,
  type WasmSymbolicationSpec,
} from 'firefox-profiler/profile-logic/wasm-symbolication';
import { mergeThreads } from 'firefox-profiler/profile-logic/merge-compare';
import { getTimeRangeForThread } from 'firefox-profiler/profile-logic/profile-data';
import {
  correlateIPCMarkers,
  deriveMarkersFromRawMarkerTable,
  getSearchFilteredMarkerIndexes,
  stringsToMarkerRegExps,
} from 'firefox-profiler/profile-logic/marker-data';
import { markerSchemaFrontEndOnly } from 'firefox-profiler/profile-logic/marker-schema';
import { getDefaultCategories } from 'firefox-profiler/profile-logic/data-structures';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { splitSearchString } from 'firefox-profiler/utils/string';
import type { MarkerSchemaByName } from 'firefox-profiler/types/markers';
import type { Profile, RawThread } from 'firefox-profiler/types/profile';
import type { StartEndRange } from 'firefox-profiler/types/units';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import {
  parseLabelToml,
  resolveAllLabels,
} from 'firefox-profiler/utils/label-templates';

/**
 * A CLI tool for editing profiles.
 *
 * To use it, first build:
 *   yarn build-node-tools
 *
 * Then run:
 *   node node-tools-dist/profiler-edit.js -i <profile> -o <output> [options]
 *
 * Examples:
 *   node node-tools-dist/profiler-edit.js -i samply-profile.json -o out.json \
 *     --symbolicate-with-server http://localhost:8001/abcdef/
 *
 *   node node-tools-dist/profiler-edit.js -i input.json.gz -o out.json.gz \
 *     --symbolicate-wasm http://host/a.wasm=./a-unstripped.wasm \
 *     --symbolicate-wasm http://host/b.wasm=./b-unstripped.wasm
 *
 *   node node-tools-dist/profiler-edit.js --from-hash w1spyw917hg... -o out.json.gz \
 *     --insert-label-frames known-functions.toml
 *
 *   node node-tools-dist/profiler-edit.js -i big.json.gz -o small.json.gz \
 *     --only-keep-threads-with-markers-matching '-async,-sync' \
 *     --merge-non-overlapping-threads-by-name
 */

type ProfileSource =
  | { type: 'FILE'; path: string }
  | { type: 'URL'; url: string }
  | { type: 'HASH'; hash: string };

interface WasmSymbolicationCliSpec {
  path: string;
  url?: string;
}

export interface CliOptions {
  input: ProfileSource;
  output: string;
  symbolicateWithServer?: string;
  symbolicateWasm?: WasmSymbolicationCliSpec[];
  insertLabelFrames?: string;
  onlyKeepThreadsWithMarkersMatching?: string;
  mergeNonOverlappingThreadsByName?: boolean;
  setName?: string;
}

function loadWasmSymbolicationSpecs(
  cliSpecs: WasmSymbolicationCliSpec[]
): WasmSymbolicationSpec[] {
  return cliSpecs.map((spec) => {
    console.log(`Reading wasm symbols from ${spec.path}`);
    const buf = fs.readFileSync(spec.path);
    return {
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      url: spec.url,
      label: spec.path,
    };
  });
}

/**
 * Reconstruct the func-name strings used by insertStackLabels' prefix matcher
 * (mirrors getLabelIndexForFunc in insert-stack-labels.ts), so auto-discovery
 * sees the same strings the labeler will compare against.
 */
function collectFuncNames(profile: Profile): string[] {
  const { funcTable, sources, stringArray } = profile.shared;
  const result: string[] = [];
  for (let i = 0; i < funcTable.length; i++) {
    let name = stringArray[funcTable.name[i]];
    const sourceIndex = funcTable.source[i];
    if (sourceIndex !== null) {
      const filename = stringArray[sources.filename[sourceIndex]];
      const line = funcTable.lineNumber[i];
      const col = funcTable.columnNumber[i];
      if (line !== null && col !== null) {
        name += ` (${filename}:${line}:${col})`;
      } else if (line !== null) {
        name += ` (${filename}:${line})`;
      } else {
        name += ` (${filename})`;
      }
    }
    result.push(name);
  }
  return result;
}

/**
 * Keep only the threads that have at least one marker matching the given
 * marker search string (using the same syntax as the front-end: comma-
 * separated terms, optional `field:value` and `-field:value` qualifiers).
 * We derive markers and run the standard search filter so that string-table
 * indexed payload fields (UserTiming.name, IPC fields, ...) are resolved
 * correctly.
 */
function filterThreadsByMarkerSearch(
  profile: Profile,
  search: string
): Profile {
  const searchRegExps = stringsToMarkerRegExps(splitSearchString(search));
  if (searchRegExps === null) {
    return profile;
  }

  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);
  const categoryList = profile.meta.categories ?? getDefaultCategories();

  const frontEndSchemaNames = new Set(
    markerSchemaFrontEndOnly.map((schema) => schema.name)
  );
  const schemaList = [
    ...(profile.meta.markerSchema ?? []).filter(
      (schema) => !frontEndSchemaNames.has(schema.name)
    ),
    ...markerSchemaFrontEndOnly,
  ];
  const markerSchemaByName: MarkerSchemaByName = Object.create(null);
  for (const schema of schemaList) {
    markerSchemaByName[schema.name] = schema;
  }

  const ipcCorrelations = correlateIPCMarkers(profile.threads, profile.shared);

  const threads = profile.threads.filter((thread) => {
    const { markers } = deriveMarkersFromRawMarkerTable(
      thread.markers,
      profile.shared.stringArray,
      thread.tid,
      getTimeRangeForThread(thread, profile.meta.interval),
      ipcCorrelations
    );
    if (markers.length === 0) {
      return false;
    }
    const markerIndexes = markers.map((_, i) => i);
    const filtered = getSearchFilteredMarkerIndexes(
      (i) => markers[i],
      markerIndexes,
      markerSchemaByName,
      searchRegExps,
      stringTable,
      categoryList
    );
    return filtered.length > 0;
  });

  return { ...profile, threads };
}

/**
 * First-fit interval coloring: partition `items` (sorted by start time) into
 * subgroups such that within each subgroup no two items overlap.
 */
function partitionNonOverlapping<T>(
  itemsSortedByStart: T[],
  rangeOf: (item: T) => StartEndRange
): T[][] {
  const subgroups: { items: T[]; lastEnd: number }[] = [];
  for (const item of itemsSortedByStart) {
    const range = rangeOf(item);
    let placed = false;
    for (const sg of subgroups) {
      if (sg.lastEnd <= range.start) {
        sg.items.push(item);
        sg.lastEnd = range.end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      subgroups.push({ items: [item], lastEnd: range.end });
    }
  }
  return subgroups.map((sg) => sg.items);
}

/**
 * Merges threads from sequential runs of the same logical workload.
 *
 * Two-stage approach:
 *
 *   1. Group processes (i.e. all threads sharing a pid) by (processName,
 *      processType, mainThreadName) and partition each group into matched
 *      bundles of non-overlapping processes via first-fit interval coloring.
 *      Each non-singleton bundle represents one logical process whose
 *      lifetime spans multiple runs.
 *
 *   2. Within each matched bundle, merge same-named threads across the
 *      bundled processes. Same-named threads inside a single process are
 *      not merged (they may overlap), so we again partition by non-overlap
 *      before merging.
 *
 * Threads belonging to a singleton process bundle are passed through
 * unchanged.
 */
function mergeNonOverlappingThreadsByName(profile: Profile): Profile {
  const interval = profile.meta.interval;
  const threads = profile.threads;

  const threadRanges = threads.map((t) => getTimeRangeForThread(t, interval));

  type ProcessInfo = {
    pid: RawThread['pid'];
    threadIndices: number[];
    range: StartEndRange;
    processName: string | undefined;
    processType: string;
    mainThreadName: string;
  };

  const processesByPid = new Map<RawThread['pid'], ProcessInfo>();
  for (let i = 0; i < threads.length; i++) {
    const t = threads[i];
    let proc = processesByPid.get(t.pid);
    if (proc === undefined) {
      proc = {
        pid: t.pid,
        threadIndices: [],
        range: { start: Infinity, end: -Infinity },
        processName: t.processName,
        processType: t.processType,
        mainThreadName: t.name,
      };
      processesByPid.set(t.pid, proc);
    }
    proc.threadIndices.push(i);
    if (t.isMainThread) {
      proc.mainThreadName = t.name;
      if (t.processName !== undefined) {
        proc.processName = t.processName;
      }
    }
    const r = threadRanges[i];
    if (r.start < proc.range.start) {
      proc.range.start = r.start;
    }
    if (r.end > proc.range.end) {
      proc.range.end = r.end;
    }
  }

  const processGroups = new Map<string, ProcessInfo[]>();
  for (const proc of processesByPid.values()) {
    const key = `${proc.processName ?? ''}\u0000${proc.processType}\u0000${proc.mainThreadName}`;
    let g = processGroups.get(key);
    if (g === undefined) {
      g = [];
      processGroups.set(key, g);
    }
    g.push(proc);
  }

  const mergedIndexes = new Set<number>();
  const mergeReplacements = new Map<number, RawThread>();
  let mergedProcessBundles = 0;

  for (const procs of processGroups.values()) {
    if (procs.length <= 1) {
      continue;
    }
    procs.sort((a, b) => a.range.start - b.range.start);
    const bundles = partitionNonOverlapping(procs, (p) => p.range);

    for (const bundle of bundles) {
      if (bundle.length <= 1) {
        continue;
      }
      mergedProcessBundles++;

      // Group threads in this bundle by name, partition each by non-overlap,
      // and merge subgroups of size > 1.
      const threadsByName = new Map<string, number[]>();
      for (const proc of bundle) {
        for (const tIdx of proc.threadIndices) {
          const name = threads[tIdx].name;
          let arr = threadsByName.get(name);
          if (arr === undefined) {
            arr = [];
            threadsByName.set(name, arr);
          }
          arr.push(tIdx);
        }
      }

      for (const tIndices of threadsByName.values()) {
        if (tIndices.length <= 1) {
          continue;
        }
        tIndices.sort((a, b) => threadRanges[a].start - threadRanges[b].start);
        const tBundles = partitionNonOverlapping(
          tIndices,
          (i) => threadRanges[i]
        );
        for (const tb of tBundles) {
          if (tb.length <= 1) {
            continue;
          }
          const sourceThreads = tb.map((i) => threads[i]);
          const original = sourceThreads[0];
          const merged = mergeThreads(sourceThreads);
          merged.name = original.name;
          merged.pid = original.pid;
          merged.tid = original.tid;
          merged.processType = original.processType;
          merged.processName = original.processName;
          merged.isMainThread = original.isMainThread;

          mergeReplacements.set(tb[0], merged);
          for (let k = 1; k < tb.length; k++) {
            mergedIndexes.add(tb[k]);
          }
        }
      }
    }
  }

  if (mergeReplacements.size === 0) {
    return profile;
  }

  const newThreads: RawThread[] = [];
  for (let i = 0; i < threads.length; i++) {
    if (mergedIndexes.has(i)) {
      continue;
    }
    const replacement = mergeReplacements.get(i);
    newThreads.push(replacement ?? threads[i]);
  }

  console.log(
    `Matched ${mergedProcessBundles} non-overlapping process bundles. Merged ${mergedIndexes.size + mergeReplacements.size} threads into ${mergeReplacements.size}, going from ${threads.length} to ${newThreads.length} threads.`
  );

  return { ...profile, threads: newThreads };
}

async function loadProfile(source: ProfileSource): Promise<Profile> {
  switch (source.type) {
    case 'FILE': {
      console.log(`Loading profile from file ${source.path}`);
      const bytes = fs.readFileSync(source.path, null);
      const profile = await unserializeProfileOfArbitraryFormat(bytes);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      return profile;
    }
    case 'URL': {
      console.log(`Loading profile from URL ${source.url}`);
      const response = await fetch(source.url);
      if (!response.ok) {
        throw new Error(
          `Unexpected response code: ${response.status} / ${response.statusText}`
        );
      }
      const bytes = await response.arrayBuffer();
      const profile = await unserializeProfileOfArbitraryFormat(
        new Uint8Array(bytes)
      );
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      return profile;
    }
    case 'HASH': {
      const url = `https://storage.googleapis.com/${GOOGLE_STORAGE_BUCKET}/${source.hash}`;
      console.log(`Loading profile from hash ${source.hash}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Unexpected response code: ${response.status} / ${response.statusText}`
        );
      }
      const bytes = await response.arrayBuffer();
      const profile = await unserializeProfileOfArbitraryFormat(
        new Uint8Array(bytes)
      );
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      return profile;
    }
    default:
      throw assertExhaustiveCheck(source);
  }
}

export async function run(options: CliOptions) {
  let profile = await loadProfile(options.input);

  if (options.symbolicateWithServer !== undefined) {
    const server = options.symbolicateWithServer;
    const symbolStore = new SymbolStore({
      requestSymbolsFromServer: async (requests) => {
        for (const { lib } of requests) {
          console.log(`  Loading symbols for ${lib.debugName}`);
        }
        try {
          return await MozillaSymbolicationAPI.requestSymbols(
            'symbol server',
            requests,
            async (path, json) => {
              const response = await fetch(server + path, {
                body: json,
                method: 'POST',
              });
              return response.json();
            }
          );
        } catch (e) {
          throw new Error(
            `There was a problem with the symbolication API request to the symbol server: ${e.message}`
          );
        }
      },
      requestSymbolsFromBrowser: async () => [],
      requestSymbolsViaSymbolTableFromBrowser: async () => {
        throw new Error('Not supported in this context');
      },
    });

    console.log('Symbolicating...');
    const symbolicationSteps: SymbolicationStepInfo[] = [];
    await symbolicateProfile(profile, symbolStore, (step) => {
      symbolicationSteps.push(step);
    });
    console.log('Applying collected symbolication steps...');
    const { shared, threads } = applySymbolicationSteps(
      profile.threads,
      profile.shared,
      symbolicationSteps
    );
    profile.shared = shared;
    profile.threads = threads;
    profile.meta.symbolicated = true;
  }

  if (options.symbolicateWasm !== undefined) {
    applyWasmSymbolication(
      profile,
      loadWasmSymbolicationSpecs(options.symbolicateWasm)
    );
  }

  if (options.insertLabelFrames !== undefined) {
    console.log('Inserting label frames...');
    const tomlText = fs.readFileSync(options.insertLabelFrames, 'utf8');
    const parsed = parseLabelToml(tomlText);
    const funcNames = collectFuncNames(profile);
    const labels = resolveAllLabels(parsed, funcNames);
    profile = insertStackLabels(profile, labels);
  }

  if (
    options.onlyKeepThreadsWithMarkersMatching !== undefined &&
    options.onlyKeepThreadsWithMarkersMatching !== ''
  ) {
    const before = profile.threads.length;
    profile = filterThreadsByMarkerSearch(
      profile,
      options.onlyKeepThreadsWithMarkersMatching
    );
    console.log(
      `Kept ${profile.threads.length} of ${before} threads with markers matching ${JSON.stringify(options.onlyKeepThreadsWithMarkersMatching)}.`
    );
  }

  if (options.mergeNonOverlappingThreadsByName) {
    profile = mergeNonOverlappingThreadsByName(profile);
  }

  if (options.setName !== undefined) {
    profile.meta.product = options.setName;
  }

  console.log(`Saving profile to ${options.output}`);
  if (options.output.endsWith('.gz')) {
    fs.writeFileSync(options.output, await compress(JSON.stringify(profile)));
  } else {
    fs.writeFileSync(options.output, JSON.stringify(profile));
  }
  console.log('Finished.');
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = minimist(processArgv.slice(2), {
    alias: { i: 'input', o: 'output' },
    boolean: ['merge-non-overlapping-threads-by-name'],
  });

  const sources: ProfileSource[] = [];

  if (typeof argv.input === 'string' && argv.input !== '') {
    if (/^https?:\/\//i.test(argv.input)) {
      sources.push({ type: 'URL', url: argv.input });
    } else {
      sources.push({ type: 'FILE', path: argv.input });
    }
  }
  if (typeof argv['from-file'] === 'string' && argv['from-file'] !== '') {
    sources.push({ type: 'FILE', path: argv['from-file'] });
  }
  if (typeof argv['from-url'] === 'string' && argv['from-url'] !== '') {
    sources.push({ type: 'URL', url: argv['from-url'] });
  }
  if (typeof argv['from-hash'] === 'string' && argv['from-hash'] !== '') {
    sources.push({ type: 'HASH', hash: argv['from-hash'] });
  }

  if (sources.length === 0) {
    throw new Error(
      'An input must be supplied: use -i <FILE_OR_URL>, --from-file <path>, --from-url <url>, or --from-hash <hash>'
    );
  }
  if (sources.length > 1) {
    throw new Error(
      'Only one input may be supplied (-i, --from-file, --from-url, --from-hash)'
    );
  }

  if (!(typeof argv.output === 'string' && argv.output !== '')) {
    throw new Error('An output path must be supplied with --output / -o');
  }

  const symbolicateWasm: WasmSymbolicationCliSpec[] = [];
  const rawWasmArg = argv['symbolicate-wasm'];
  let wasmArgs: unknown[];
  if (rawWasmArg === undefined) {
    wasmArgs = [];
  } else if (Array.isArray(rawWasmArg)) {
    wasmArgs = rawWasmArg;
  } else {
    wasmArgs = [rawWasmArg];
  }
  for (const arg of wasmArgs) {
    if (typeof arg !== 'string' || arg === '') {
      throw new Error('--symbolicate-wasm requires a value');
    }
    // Accept "<url>=<path>" if the LHS looks like a URL, otherwise treat the
    // whole string as a path and infer the URL from the profile. Split on
    // the last `=` so URLs containing `=` (e.g. in query strings) survive
    // intact; this assumes file paths don't contain `=`.
    const eqIndex = arg.lastIndexOf('=');
    if (eqIndex !== -1 && /^[a-z]+:\/\//i.test(arg.slice(0, eqIndex))) {
      symbolicateWasm.push({
        url: arg.slice(0, eqIndex),
        path: arg.slice(eqIndex + 1),
      });
    } else {
      symbolicateWasm.push({ path: arg });
    }
  }

  const rawMarkerArg = argv['only-keep-threads-with-markers-matching'];
  let onlyKeepThreadsWithMarkersMatching: string | undefined;
  if (rawMarkerArg !== undefined) {
    if (typeof rawMarkerArg !== 'string' || rawMarkerArg === '') {
      throw new Error(
        '--only-keep-threads-with-markers-matching requires a value (use `=` syntax for values starting with `-`, e.g. --only-keep-threads-with-markers-matching=-async,-sync)'
      );
    }
    onlyKeepThreadsWithMarkersMatching = rawMarkerArg;
  }

  const rawSetName = argv['set-name'];
  let setName: string | undefined;
  if (rawSetName !== undefined) {
    if (typeof rawSetName !== 'string' || rawSetName === '') {
      throw new Error('--set-name requires a non-empty value');
    }
    setName = rawSetName;
  }

  return {
    input: sources[0],
    output: argv.output,
    symbolicateWithServer:
      typeof argv['symbolicate-with-server'] === 'string' &&
      argv['symbolicate-with-server'] !== ''
        ? argv['symbolicate-with-server']
        : undefined,
    symbolicateWasm,
    insertLabelFrames:
      typeof argv['insert-label-frames'] === 'string' &&
      argv['insert-label-frames'] !== ''
        ? argv['insert-label-frames']
        : undefined,
    onlyKeepThreadsWithMarkersMatching,
    mergeNonOverlappingThreadsByName:
      argv['merge-non-overlapping-threads-by-name'] === true,
    setName,
  };
}

if (require.main === module) {
  const options = makeOptionsFromArgv(process.argv);
  run(options).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
