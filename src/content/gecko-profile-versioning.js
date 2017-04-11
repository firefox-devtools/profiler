// @flow
/**
 * This file deals with old versions of the Gecko profile format, i.e. the
 * format that the Gecko profiler platform outputs. We want to be able to
 * run perf.html on non-Nightly versions of Firefox, and we want to be able
 * to load old saved profiles, so this file upgrades old profiles to the
 * current format.
*/

export const CURRENT_VERSION = 6; // The current version of the 'raw profile' format.

// Gecko profiles before version 1 did not have a profile.meta.version field.
// Treat those as version zero.
const UNANNOTATED_VERSION = 0;

/**
 * Upgrades the supplied profile to the current version, by mutating |profile|.
 * Throws an exception if the profile is too new.
 * @param {object} profile The profile in the "Gecko profile" format.
 */
export function upgradeGeckoProfileToCurrentVersion(profile: Object) {
  const profileVersion = profile.meta.version || UNANNOTATED_VERSION;
  if (profileVersion === CURRENT_VERSION) {
    return;
  }

  if (profileVersion > CURRENT_VERSION) {
    throw new Error(
      `Unable to parse a Gecko profile of version ${profileVersion} - are you running an outdated version of perf.html? ` +
        `The most recent version understood by this version of perf.html is version ${CURRENT_VERSION}.\n` +
        'You can try refreshing this page in case perf.html has updated in the meantime.'
    );
  }

  // Convert to CURRENT_VERSION, one step at a time.
  for (
    let destVersion = profileVersion + 1;
    destVersion <= CURRENT_VERSION;
    destVersion++
  ) {
    if (destVersion in _upgraders) {
      _upgraders[destVersion](profile);
    }
  }

  profile.meta.version = CURRENT_VERSION;
}

function _archFromAbi(abi) {
  if (abi === 'x86_64-gcc3') {
    return 'x86_64';
  }
  return abi;
}

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
const _upgraders = {
  [1]: () => {
    throw new Error(
      'Gecko profiles without version numbers are very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [2]: () => {
    throw new Error(
      'Gecko profile version 1 is very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [3]: () => {
    throw new Error(
      'Gecko profile version 2 is very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [4]: profile => {
    function convertToVersionFourRecursive(p) {
      // In version < 3, p.libs was a JSON string.
      // Starting with version 4, libs is an actual array, each lib has
      // "debugName", "debugPath", "breakpadId" and "path" fields, and the
      // array is sorted by start address.
      p.libs = JSON.parse(p.libs)
        .map(lib => {
          if ('breakpadId' in lib) {
            lib.debugName = lib.name.substr(lib.name.lastIndexOf('/') + 1);
            lib.breakpadId = lib.breakpadId;
          } else {
            lib.debugName = lib.pdbName;
            const pdbSig = lib.pdbSignature.replace(/[{}-]/g, '').toUpperCase();
            lib.breakpadId = pdbSig + lib.pdbAge;
          }
          delete lib.pdbName;
          delete lib.pdbAge;
          delete lib.pdbSignature;
          lib.path = lib.name;
          lib.name = lib.debugName.endsWith('.pdb') ? lib.debugName.substr(0, lib.debugName.length - 4) : lib.debugName;
          lib.arch = _archFromAbi(p.meta.abi);
          lib.debugPath = '';
          return lib;
        })
        .sort((a, b) => a.start - b.start);

      for (let threadIndex = 0; threadIndex < p.threads.length; threadIndex++) {
        if (typeof p.threads[threadIndex] === 'string') {
          // Also do the modification to embedded subprocess profiles.
          const subprocessProfile = JSON.parse(p.threads[threadIndex]);
          convertToVersionFourRecursive(subprocessProfile);
          p.threads[threadIndex] = JSON.stringify(subprocessProfile);
        } else {
          // At the beginning of format version 3, the thread name for any
          // threads in a "tab" process was "Content", and the processType
          // field did not exist. When this was changed, the version was not
          // updated, so we handle both cases here.
          const thread = p.threads[threadIndex];
          if (!('processType' in thread)) {
            if (thread.name === 'Content') {
              thread.processType = 'tab';
              thread.name = 'GeckoMain';
            } else if (thread.name === 'Plugin') {
              thread.processType = 'plugin';
            } else {
              thread.processType = 'default';
            }
          }
        }
      }

      p.meta.version = 4;
    }
    convertToVersionFourRecursive(profile);
  },
  [5]: profile => {
    // In version 4, profiles from other processes were embedded as JSON
    // strings in the threads array. Version 5 breaks those out into a
    // separate "processes" array and no longer stringifies them.
    function convertToVersionFiveRecursive(p) {
      const allThreadsAndProcesses = p.threads.map(threadOrProcess => {
        if (typeof threadOrProcess === 'string') {
          const processProfile = JSON.parse(threadOrProcess);
          convertToVersionFiveRecursive(processProfile);
          return {
            type: 'process',
            data: processProfile,
          };
        }
        return {
          type: 'thread',
          data: threadOrProcess,
        };
      });
      p.processes = allThreadsAndProcesses.filter(x => x.type === 'process').map(p => p.data);
      p.threads = allThreadsAndProcesses.filter(x => x.type === 'thread').map(t => t.data);
      p.meta.version = 5;
    }
    convertToVersionFiveRecursive(profile);
  },
  [6]: profile => {
    // The frameNumber column was removed from the samples table.
    function convertToVersionSixRecursive(p) {
      for (const thread of p.threads) {
        delete thread.samples.schema.frameNumber;
        for (let sampleIndex = 0; sampleIndex < thread.samples.data.length; sampleIndex++) {
          // Truncate the array to a maximum length of 5.
          // The frameNumber used to be the last item, at index 5.
          thread.samples.data[sampleIndex].splice(5);
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionSixRecursive(subprocessProfile);
      }
    }
    convertToVersionSixRecursive(profile);
  },
};
