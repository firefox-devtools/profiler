/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from 'commander';
import { parse as parseToml } from 'smol-toml';

import {
  serializeProfileToJsonSlabsFile,
  serializeProfileToJsonString,
  unserializeProfileOfArbitraryFormat,
} from 'firefox-profiler/profile-logic/process-profile';
import { computeCompactedProfile } from 'firefox-profiler/profile-logic/profile-compacting';
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
import { getThreadsWithMarkersMatchingSearchFilter } from 'firefox-profiler/profile-logic/marker-data';
import type { Profile } from 'firefox-profiler/types/profile';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import {
  type AutoLabel,
  type LabelDescription,
  resolveAllLabels,
} from 'firefox-profiler/utils/label-templates';
import { mergeNonOverlappingThreadsByName } from 'firefox-profiler/profile-logic/merge-compare';
import { StringTable } from 'firefox-profiler/utils/string-table';

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
 *
 *   node node-tools-dist/profiler-edit.js -i in.json -o out.json \
 *     --canonicalize-js-location
 */

export type ProfileSource =
  | { type: 'FILE'; path: string }
  | { type: 'URL'; url: string }
  | { type: 'HASH'; hash: string };

// Describes one --symbolicate-wasm argument: a local unstripped wasm file that
// supplies symbol names, plus (optionally) the URL of the stripped wasm in the
// profile to which those names should be applied. If `strippedWasmUrl` is
// omitted, the profile must contain exactly one .wasm source, which is used.
export interface WasmSymbolicationCliSpec {
  // Path to the local unstripped .wasm file (with a "name" custom section).
  unstrippedWasmPath: string;
  // URL of the matching stripped wasm as it appears in the profile.
  strippedWasmUrl?: string;
}

export interface CliOptions {
  input: ProfileSource;
  output: string;
  symbolicateWithServer?: string;
  symbolicateWasm: WasmSymbolicationCliSpec[];
  insertLabelFrames?: string;
  onlyKeepThreadsWithMarkersMatching?: string;
  mergeNonOverlappingThreadsByName?: boolean;
  setName?: string;
  canonicalizeJsLocation?: boolean;
}

export function loadWasmSymbolicationSpecs(
  cliSpecs: WasmSymbolicationCliSpec[]
): WasmSymbolicationSpec[] {
  return cliSpecs.map((spec) => {
    console.log(`Reading wasm symbols from ${spec.unstrippedWasmPath}`);
    const buf = fs.readFileSync(spec.unstrippedWasmPath);
    return {
      bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      url: spec.strippedWasmUrl,
      label: spec.unstrippedWasmPath,
    };
  });
}

/**
 * Reconstruct the func-name strings used by insertStackLabels' prefix matcher
 * (mirrors getLabelIndexForFunc in insert-stack-labels.ts), so auto-discovery
 * sees the same strings the labeler will compare against.
 */
export function collectFuncNames(profile: Profile): string[] {
  const { funcTable, sources, stringArray } = profile.shared;
  const result: string[] = [];
  for (let i = 0; i < funcTable.length; i++) {
    let name = stringArray[funcTable.name[i]];
    const sourceIndex = funcTable.source[i];
    if (sourceIndex !== null) {
      const filename = stringArray[sources.filename[sourceIndex]];
      name += ` (${filename})`;
    }
    result.push(name);
  }
  return result;
}

/**
 * Strip ` (file:line:col)` or ` file:line:col` location suffixes from JS func
 * names and move the location into the funcTable + sources columns instead.
 * Idempotent: re-running on an already-canonicalized profile is a no-op
 * because the trailing suffix is gone.
 */
function canonicalizeJsLocations(profile: Profile): Profile {
  const { funcTable, sources, stringArray } = profile.shared;
  const stringTable = StringTable.withBackingArray(stringArray);

  // Reuse existing source entries that already cover a whole file at the
  // standard (1, 1) origin, keyed by the filename's string index.
  const filenameToSourceIndex = new Map<number, number>();
  for (let i = 0; i < sources.length; i++) {
    if (sources.startLine[i] === 1 && sources.startColumn[i] === 1) {
      const filenameIndex = sources.filename[i];
      if (!filenameToSourceIndex.has(filenameIndex)) {
        filenameToSourceIndex.set(filenameIndex, i);
      }
    }
  }

  // The filename may contain colons (URLs), so we rely on greedy matching
  // to anchor `:line:col` at the very end of the string.
  const parenRegex = /^(.+) \((.+):(\d+):(\d+)\)$/;
  const plainRegex = /^(.+) (.+):(\d+):(\d+)$/;

  let canonicalized = 0;
  for (let i = 0; i < funcTable.length; i++) {
    if (!funcTable.isJS[i]) {
      continue;
    }
    const name = stringArray[funcTable.name[i]];
    const match = parenRegex.exec(name) ?? plainRegex.exec(name);
    if (match === null) {
      continue;
    }
    const cleanName = match[1];
    const filename = match[2];
    const line = parseInt(match[3], 10);
    const col = parseInt(match[4], 10);

    const filenameIndex = stringTable.indexForString(filename);
    let sourceIndex = filenameToSourceIndex.get(filenameIndex);
    if (sourceIndex === undefined) {
      sourceIndex = sources.length;
      sources.id[sourceIndex] = null;
      sources.filename[sourceIndex] = filenameIndex;
      sources.startLine[sourceIndex] = 1;
      sources.startColumn[sourceIndex] = 1;
      sources.sourceMapURL[sourceIndex] = null;
      sources.length++;
      filenameToSourceIndex.set(filenameIndex, sourceIndex);
    }

    funcTable.name[i] = stringTable.indexForString(cleanName);
    funcTable.source[i] = sourceIndex;
    funcTable.lineNumber[i] = line;
    funcTable.columnNumber[i] = col;
    canonicalized++;
  }

  console.log(`Canonicalized location of ${canonicalized} JS function(s).`);
  return profile;
}

export type ParsedLabelToml = {
  labels: LabelDescription[];
  autoLabels: AutoLabel[];
};

export function parseLabelToml(tomlText: string): ParsedLabelToml {
  const data = parseToml(tomlText) as unknown as {
    labels?: LabelDescription[];
    auto_labels?: AutoLabel[];
  };
  return {
    labels: data.labels ?? [],
    autoLabels: data.auto_labels ?? [],
  };
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

async function encodeProfileWithFilename(
  profile: Profile,
  filename: string
): Promise<Uint8Array> {
  if (filename.endsWith('.jslb') || filename.endsWith('.jslb.gz')) {
    const bytes = serializeProfileToJsonSlabsFile(profile);
    if (filename.endsWith('.jslb.gz')) {
      return compress(bytes);
    }
    return bytes;
  }
  const s = serializeProfileToJsonString(profile);
  if (filename.endsWith('.gz')) {
    return compress(s);
  }
  return new TextEncoder().encode(s);
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

  applyWasmSymbolication(
    profile,
    loadWasmSymbolicationSpecs(options.symbolicateWasm)
  );

  if (options.insertLabelFrames !== undefined) {
    console.log('Inserting label frames...');
    const tomlText = fs.readFileSync(options.insertLabelFrames, 'utf8');
    const parsed = parseLabelToml(tomlText);
    const funcNames = collectFuncNames(profile);
    const labels = resolveAllLabels(
      parsed.autoLabels,
      parsed.labels,
      funcNames
    );
    profile = insertStackLabels(profile, labels);
  }

  if (
    options.onlyKeepThreadsWithMarkersMatching !== undefined &&
    options.onlyKeepThreadsWithMarkersMatching !== ''
  ) {
    const before = profile.threads.length;
    const matchingThreadIndexes = getThreadsWithMarkersMatchingSearchFilter(
      profile,
      options.onlyKeepThreadsWithMarkersMatching
    );
    const matchingThreads = profile.threads.filter((_thread, threadIndex) =>
      matchingThreadIndexes.has(threadIndex)
    );
    profile = { ...profile, threads: matchingThreads };
    console.log(
      `Kept ${profile.threads.length} of ${before} threads with markers matching ${JSON.stringify(options.onlyKeepThreadsWithMarkersMatching)}.`
    );
  }

  if (options.mergeNonOverlappingThreadsByName) {
    profile = mergeNonOverlappingThreadsByName(profile);
  }

  if (options.canonicalizeJsLocation) {
    profile = canonicalizeJsLocations(profile);
  }

  if (options.setName !== undefined) {
    profile.meta.product = options.setName;
  }

  const { profile: compactedProfile } = computeCompactedProfile(profile);

  const outputFilename = options.output;
  console.log(`Saving profile to ${outputFilename}`);
  const bytes = await encodeProfileWithFilename(
    compactedProfile,
    outputFilename
  );
  fs.writeFileSync(outputFilename, bytes);
  console.log('Finished.');
}

function collectWasm(
  value: string,
  previous: WasmSymbolicationCliSpec[]
): WasmSymbolicationCliSpec[] {
  // Accept "<url>=<path>" if the LHS looks like a URL, otherwise treat the
  // whole string as a path and infer the URL from the profile. Split on
  // the last `=` so URLs containing `=` (e.g. in query strings) survive
  // intact; this assumes file paths don't contain `=`.
  const eqIndex = value.lastIndexOf('=');
  if (eqIndex !== -1 && /^[a-z]+:\/\//i.test(value.slice(0, eqIndex))) {
    return [
      ...previous,
      {
        strippedWasmUrl: value.slice(0, eqIndex),
        unstrippedWasmPath: value.slice(eqIndex + 1),
      },
    ];
  }
  return [...previous, { unstrippedWasmPath: value }];
}

function requireNonEmpty(flagName: string): (value: string) => string {
  return (value: string) => {
    if (value === '') {
      throw new InvalidArgumentError(`${flagName} requires a non-empty value`);
    }
    return value;
  };
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const program = new Command();
  program
    .name('profiler-edit')
    .description('Edit and transform Firefox performance profiles')
    .exitOverride()
    .option(
      '-i, --input <fileOrUrl>',
      'Input profile (file path or http(s) URL)'
    )
    .option('-o, --output <path>', 'Output path (.json or .json.gz)')
    .option('--from-file <path>', 'Load input from a file')
    .option('--from-url <url>', 'Load input from a URL')
    .option('--from-hash <hash>', 'Load input from a profile hash')
    .option(
      '--symbolicate-with-server <url>',
      'Symbolicate frames using this symbol server URL'
    )
    .addOption(
      new Option(
        '--symbolicate-wasm <spec>',
        'Apply wasm symbol info, as <url>=<path> or just <path>'
      )
        .argParser(collectWasm)
        .default([] as WasmSymbolicationCliSpec[])
    )
    .option('--insert-label-frames <path>', 'TOML file with label definitions')
    .option(
      '--only-keep-threads-with-markers-matching <search>',
      'Keep only threads with markers matching the given search string'
    )
    .option(
      '--merge-non-overlapping-threads-by-name',
      'Merge same-named threads across non-overlapping process runs'
    )
    .option(
      '--set-name <name>',
      'Override the profile product name',
      requireNonEmpty('--set-name')
    )
    .option(
      '--canonicalize-js-location',
      'Move "name (file:line:col)" suffixes on JS functions into the funcTable + sources columns'
    );

  program.parse(processArgv);
  const opts = program.opts();

  const sources: ProfileSource[] = [];
  if (typeof opts.input === 'string' && opts.input !== '') {
    if (/^https?:\/\//i.test(opts.input)) {
      sources.push({ type: 'URL', url: opts.input });
    } else {
      sources.push({ type: 'FILE', path: opts.input });
    }
  }
  if (typeof opts.fromFile === 'string' && opts.fromFile !== '') {
    sources.push({ type: 'FILE', path: opts.fromFile });
  }
  if (typeof opts.fromUrl === 'string' && opts.fromUrl !== '') {
    sources.push({ type: 'URL', url: opts.fromUrl });
  }
  if (typeof opts.fromHash === 'string' && opts.fromHash !== '') {
    sources.push({ type: 'HASH', hash: opts.fromHash });
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

  if (!(typeof opts.output === 'string' && opts.output !== '')) {
    throw new Error('An output path must be supplied with --output / -o');
  }

  return {
    input: sources[0],
    output: opts.output,
    symbolicateWithServer:
      typeof opts.symbolicateWithServer === 'string' &&
      opts.symbolicateWithServer !== ''
        ? opts.symbolicateWithServer
        : undefined,
    symbolicateWasm: opts.symbolicateWasm,
    insertLabelFrames:
      typeof opts.insertLabelFrames === 'string' &&
      opts.insertLabelFrames !== ''
        ? opts.insertLabelFrames
        : undefined,
    onlyKeepThreadsWithMarkersMatching:
      typeof opts.onlyKeepThreadsWithMarkersMatching === 'string' &&
      opts.onlyKeepThreadsWithMarkersMatching !== ''
        ? opts.onlyKeepThreadsWithMarkersMatching
        : undefined,
    mergeNonOverlappingThreadsByName:
      opts.mergeNonOverlappingThreadsByName === true,
    setName: typeof opts.setName === 'string' ? opts.setName : undefined,
    canonicalizeJsLocation: opts.canonicalizeJsLocation === true,
  };
}

if (require.main === module) {
  try {
    const options = makeOptionsFromArgv(process.argv);
    run(options).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } catch (err) {
    if (err instanceof CommanderError) {
      // Commander already wrote its own output and chose the
      // appropriate exit code.
      process.exit(err.exitCode);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
