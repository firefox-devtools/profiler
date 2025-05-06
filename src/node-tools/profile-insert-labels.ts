/**
 * Merge two existing profiles, taking the samples from the first profile and
 * the markers from the second profile.
 *
 * This was useful during early 2025 when the Mozilla Performance team was
 * doing a lot of Android startup profiling:
 *
 * - The "samples" profile would be collected using simpleperf and converted
 *   with samply import.
 * - The "markers" profile would be collected using the Gecko profiler.
 *
 * To use this script, it first needs to be built:
 *   yarn build-node-tools
 *
 * Then it can be run from the `node-tools-dist` directory:
 *   node node-tools-dist/profile-insert-labels.js --labels src/node-tools/profile-insert-labels/known-functions.toml --hash w1spyw917hgfw56x5jzfs27q89dkphhqqzw2nag --output-file ~/Downloads/labeled-profile.json.gz
 *
 * For example:
 *   yarn build-node-tools && node node-tools-dist/profile-insert-labels.js --labels src/node-tools/profile-insert-labels/known-functions.toml --hash w1spyw917hgfw56x5jzfs27q89dkphhqqzw2nag --output-file ~/Downloads/labeled-profile.json.gz
 *
 */

import fs from 'fs';
import minimist from 'minimist';
import { parse as parseToml } from 'smol-toml';

import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { GOOGLE_STORAGE_BUCKET } from 'firefox-profiler/app-logic/constants';

import type { Profile } from 'firefox-profiler/types/profile';
import { compress } from 'firefox-profiler/utils/gz';
import { insertStackLabels } from 'firefox-profiler/profile-logic/insert-stack-labels';

type ProfileSource =
  | {
      type: 'HASH';
      hash: string;
    }
  | {
      type: 'FILE';
      file: string;
    };

interface CliOptions {
  profile: ProfileSource;
  labelsFile: string;
  outputFile: string;
}

export function getProfileUrlForHash(hash: string): string {
  // See https://cloud.google.com/storage/docs/access-public-data
  // The URL is https://storage.googleapis.com/<BUCKET>/<FILEPATH>.
  // https://<BUCKET>.storage.googleapis.com/<FILEPATH> seems to also work but
  // is not documented nowadays.

  // By convention, "profile-store" is the name of our bucket, and the file path
  // is the hash we receive in the URL.
  return `https://storage.googleapis.com/${GOOGLE_STORAGE_BUCKET}/${hash}`;
}

async function fetchProfileWithHash(hash: string): Promise<Profile> {
  const response = await fetch(getProfileUrlForHash(hash));
  const serializedProfile = await response.json();
  return unserializeProfileOfArbitraryFormat(serializedProfile);
}

async function loadProfileFromFile(path: string): Promise<Profile> {
  const uint8Array = fs.readFileSync(path, null);
  return unserializeProfileOfArbitraryFormat(uint8Array.buffer);
}

async function loadProfile(source: ProfileSource): Promise<Profile> {
  switch (source.type) {
    case 'HASH':
      return fetchProfileWithHash(source.hash);
    case 'FILE':
      return loadProfileFromFile(source.file);
    default:
      return source;
  }
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

export function applyModifier(value: string, modifier: string | undefined): string {
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

export function expandPattern(pattern: string, vars: Record<string, string>): string {
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

export async function run(options: CliOptions) {
  const tomlText = fs.readFileSync(options.labelsFile, 'utf8');
  const { buckets: bucketConfigs, templates = [] } = parseToml(tomlText) as unknown as {
    buckets: BucketConfig[];
    templates?: Template[];
  };
  const buckets = resolveTemplates(bucketConfigs, templates);
  const oldProfile: Profile = await loadProfile(options.profile);
  const profile: Profile = insertStackLabels(oldProfile, buckets);

  if (options.outputFile.endsWith('.gz')) {
    fs.writeFileSync(
      options.outputFile,
      await compress(JSON.stringify(profile))
    );
  } else {
    fs.writeFileSync(options.outputFile, JSON.stringify(profile));
  }
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = minimist(processArgv.slice(2));

  const hasSamplesHash = 'hash' in argv && typeof argv.hash === 'string';
  const hasSamplesFile = 'input' in argv && typeof argv.input === 'string';

  if (!hasSamplesHash && !hasSamplesFile) {
    throw new Error('Either --input or --hash must be supplied');
  }
  if (hasSamplesHash && hasSamplesFile) {
    throw new Error('Only one of --input or --hash can be supplied');
  }

  const profile: ProfileSource = hasSamplesHash
    ? { type: 'HASH', hash: argv.hash }
    : { type: 'FILE', file: argv.input };

  if (!('labels' in argv) || typeof argv.labels !== 'string') {
    throw new Error('--labels must be supplied');
  }

  return {
    profile,
    labelsFile: argv.labels,
    outputFile: argv['output-file'],
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
