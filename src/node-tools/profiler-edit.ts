/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import fs from 'fs';
import { Command, CommanderError, Option } from 'commander';

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
