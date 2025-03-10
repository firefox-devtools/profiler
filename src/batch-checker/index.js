// @flow

/**
 * This implements a simple CLI to check existing public profiles for certain
 * criteria.
 *
 * To use it it first needs to be built:
 *   yarn build-batch-checker
 *
 * Then it can be run from the `dist` directory:
 *   node dist/batch-checker.js --hashes-file <path to text file>
 *
 * For example:
 *   yarn build-batch-checker && node dist/batch-checker.js --hashes-file ~/Downloads/profile-hashes.txt
 *
 */

const fs = require('fs');

import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import { getProfileUrlForHash } from '../actions/receive-profile';
import { getTimeRangeIncludingAllThreads } from '../profile-logic/profile-data';
import { encodeUintSetForUrlComponent } from '../utils/uintarray-encoding';

interface CliOptions {
  hashesFile: string;
}

function checkProfileThreadCPUDelta(profile: any, hash: string): Set<string> {
  const outcomes = new Set();
  const rootRange = getTimeRangeIncludingAllThreads(profile);
  const { threads } = profile;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const thread = threads[threadIndex];
    const threadCPUDelta = thread.samples.threadCPUDelta;
    if (!threadCPUDelta) {
      outcomes.add('has thread without threadCPUDelta');
      continue;
    }

    outcomes.add('has thread with threadCPUDelta');
    const len = thread.samples.length;
    if (len < 2) {
      outcomes.add('has thread with fewer than two samples');
      continue;
    }
    if (threadCPUDelta[0] === null) {
      outcomes.add('has null in first threadCPUDelta');
    }
    const firstNonNullIndex = threadCPUDelta.findIndex((d) => d !== null);
    if (firstNonNullIndex !== -1) {
      for (let i = firstNonNullIndex + 1; i < len; i++) {
        if (threadCPUDelta[i] === null) {
          outcomes.add('has null after first null value in threadCPUDelta');
          const sampleTime = thread.samples.time[i];
          const relativeSampleTime = sampleTime - rootRange.start;
          const url = `https://profiler.firefox.com/public/${hash}/?v=10&thread=${encodeUintSetForUrlComponent(new Set([threadIndex]))}`;
          console.log(
            `non-null at sample ${i} on thread ${threadIndex} at relative time ${(relativeSampleTime / 1000).toFixed(3)}s: ${url}`
          );
          break;
        }
      }
    }
  }
  return outcomes;
}

function checkProfileSchemaMatching(profile: any, _hash: string): Set<string> {
  const { meta, threads } = profile;
  const { markerSchema } = meta;
  const markerSchemaNames = new Set(markerSchema.map((schema) => schema.name));
  const tracingCategories = new Set();
  const textNames = new Set();

  const outcomes = new Set();
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const thread = threads[threadIndex];
    const { markers, stringTable } = thread;
    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      const nameIndex = markers.name[markerIndex];
      const data = markers.data[markerIndex];
      if (
        data &&
        data.type &&
        data.type === 'tracing' &&
        data.category &&
        markerSchemaNames.has(data.category)
      ) {
        if (!tracingCategories.has(data.category)) {
          console.log(
            `Found tracing marker whose schema is for category ${data.category}, thread index ${threadIndex}, marker index ${markerIndex}`
          );
          outcomes.add(
            `has tracing marker whose schema is for category ${data.category}`
          );
          tracingCategories.add(data.category);
        }
        continue;
      }
      const name = stringTable.getString(nameIndex);
      if (
        data &&
        data.type &&
        data.type === 'Text' &&
        markerSchemaNames.has(name)
      ) {
        if (!textNames.has(name)) {
          console.log(
            `Found Text marker whose schema is for name ${name}, thread index ${threadIndex}, marker index ${markerIndex}`
          );
          outcomes.add(`has Text marker whose schema is for name ${name}`);
          textNames.add(name);
        }
        continue;
      }
    }
  }

  return outcomes;
}

function checkProfile(profile: any, hash: string): Set<string> {
  return checkProfileSchemaMatching(profile, hash);
}

export async function run(options: CliOptions) {
  const hashes = fs.readFileSync(options.hashesFile, 'utf8').split('\n');
  console.log(`Have ${hashes.length} hashes.`);

  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i];
    console.log(
      `Checking profile ${i + 1} of ${hashes.length} with hash ${hash}`
    );
    try {
      const response = await fetch(getProfileUrlForHash(hash));
      const serializedProfile = await response.json();
      const profile =
        await unserializeProfileOfArbitraryFormat(serializedProfile);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      const outcome = checkProfile(profile, hash);
      console.log(`Outcome: ${[...outcome].join(', ')}`);
    } catch (e) {
      console.log(`Failed: ${e}`);
    }
  }

  console.log('Finished.');
}

export function makeOptionsFromArgv(processArgv: string[]): CliOptions {
  const argv = require('minimist')(processArgv.slice(2));

  if (!('hashes-file' in argv && typeof argv['hashes-file'] === 'string')) {
    throw new Error(
      'Argument --hashes-file must be supplied with the path to a text file of profile hashes'
    );
  }

  return {
    hashesFile: argv['hashes-file'],
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
