/**
 * A CLI tool for editing profiles: symbolication and/or label frame insertion.
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
 *   node node-tools-dist/profiler-edit.js --from-hash w1spyw917hg... -o out.json.gz \
 *     --insert-label-frames known-functions.toml
 *
 *   node node-tools-dist/profiler-edit.js -i profile.json -o out.json \
 *     --symbolicate-with-server http://localhost:8001/abcdef/ \
 *     --insert-label-frames known-functions.toml
 */

import fs from 'fs';
import minimist from 'minimist';
import { parse as parseToml } from 'smol-toml';

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
import type { Profile } from 'firefox-profiler/types/profile';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

type ProfileSource =
  | { type: 'FILE'; path: string }
  | { type: 'URL'; url: string }
  | { type: 'HASH'; hash: string };

export interface CliOptions {
  input: ProfileSource;
  output: string;
  symbolicateWithServer?: string;
  insertLabelFrames?: string;
}

interface Template {
  name: string;
  patterns: string[];
}

interface BucketConfig {
  name: string;
  funcPrefixes?: string[];
  apply?: Array<{ template: string; [key: string]: string }>;
}

export function applyModifier(
  value: string,
  modifier: string | undefined
): string {
  switch (modifier) {
    case 'pascal':
      return value.charAt(0).toUpperCase() + value.slice(1);
    case 'snake':
      return value
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
    case undefined:
      return value;
    default:
      throw new Error(`Unknown template modifier: ${modifier}`);
  }
}

export function expandPattern(
  pattern: string,
  vars: Record<string, string>
): string {
  return pattern.replace(
    /\{(\w+)(?::(\w+))?\}/g,
    (_match, name: string, modifier: string | undefined) => {
      if (!(name in vars)) {
        throw new Error(`Template variable "${name}" not provided`);
      }
      return applyModifier(vars[name], modifier);
    }
  );
}

export function resolveTemplates(
  bucketConfigs: BucketConfig[],
  templates: Template[]
): Array<{ name: string; funcPrefixes: string[] }> {
  const templateMap = new Map(templates.map((t) => [t.name, t]));
  return bucketConfigs.map((bucket) => {
    const funcPrefixes = [...(bucket.funcPrefixes ?? [])];
    for (const { template: templateName, ...vars } of bucket.apply ?? []) {
      const template = templateMap.get(templateName);
      if (!template) {
        throw new Error(`Unknown template: "${templateName}"`);
      }
      for (const pattern of template.patterns) {
        funcPrefixes.push(expandPattern(pattern, vars));
      }
    }
    return { name: bucket.name, funcPrefixes };
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

  if (options.insertLabelFrames !== undefined) {
    const tomlText = fs.readFileSync(options.insertLabelFrames, 'utf8');
    const { buckets: bucketConfigs, templates = [] } = parseToml(
      tomlText
    ) as unknown as {
      buckets: BucketConfig[];
      templates?: Template[];
    };
    const buckets = resolveTemplates(bucketConfigs, templates);
    console.log('Inserting label frames...');
    profile = insertStackLabels(profile, buckets);
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
  });

  const sources: ProfileSource[] = [];

  if (typeof argv.input === 'string' && argv.input !== '') {
    if (argv.input.startsWith('https://') || argv.input.startsWith('http://')) {
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

  return {
    input: sources[0],
    output: argv.output,
    symbolicateWithServer:
      typeof argv['symbolicate-with-server'] === 'string' &&
      argv['symbolicate-with-server'] !== ''
        ? argv['symbolicate-with-server']
        : undefined,
    insertLabelFrames:
      typeof argv['insert-label-frames'] === 'string' &&
      argv['insert-label-frames'] !== ''
        ? argv['insert-label-frames']
        : undefined,
  };
}

if (!module.parent) {
  try {
    const options = makeOptionsFromArgv(process.argv);
    run(options).catch((err) => {
      throw err;
    });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
