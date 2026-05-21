/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import minimist from 'minimist';

import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { computeCompactedProfile } from 'firefox-profiler/profile-logic/profile-compacting';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';
import { compress } from 'firefox-profiler/utils/gz';
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
import type { Profile } from 'firefox-profiler/types/profile';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

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
 */

type ProfileSource =
  | { type: 'FILE'; path: string }
  | { type: 'URL'; url: string }
  | { type: 'HASH'; hash: string };

// Describes one --symbolicate-wasm argument: a local unstripped wasm file that
// supplies symbol names, plus (optionally) the URL of the stripped wasm in the
// profile to which those names should be applied. If `strippedWasmUrl` is
// omitted, the profile must contain exactly one .wasm source, which is used.
interface WasmSymbolicationCliSpec {
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
}

function loadWasmSymbolicationSpecs(
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
  const profile = await loadProfile(options.input);

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

  const { profile: compactedProfile } = computeCompactedProfile(profile);

  console.log(`Saving profile to ${options.output}`);
  if (options.output.endsWith('.gz')) {
    fs.writeFileSync(
      options.output,
      await compress(JSON.stringify(compactedProfile))
    );
  } else {
    fs.writeFileSync(options.output, JSON.stringify(compactedProfile));
  }
  console.log('Finished.');
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = minimist(processArgv.slice(2), {
    alias: { i: 'input', o: 'output' },
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
        strippedWasmUrl: arg.slice(0, eqIndex),
        unstrippedWasmPath: arg.slice(eqIndex + 1),
      });
    } else {
      symbolicateWasm.push({ unstrippedWasmPath: arg });
    }
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
  };
}

if (require.main === module) {
  const options = makeOptionsFromArgv(process.argv);
  run(options).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
