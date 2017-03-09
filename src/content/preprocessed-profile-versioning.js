// @flow
/**
 * This file deals with old versions of the "preprocessed" profile format,
 * i.e. the format that perf.html uses internally. Profiles in this format
 * can be saved out to files or uploaded to the profile store server, and we
 * want to be able to display profiles that were saved at any point in the
 * past, regardless of their version. So this file upgrades old profiles to
 * the current format.
 */

import { sortDataTable } from './data-table-utils';

export const CURRENT_VERSION = 2; // The current version of the 'preprocessed profile' format.

// Preprocessed profiles before version 1 did not have a profile.meta.preprocessedProfileVersion
// field. Treat those as version zero.
const UNANNOTATED_VERSION = 0;

export function isPreprocessedProfile(profile: Object): boolean {
  // If this profile has a .meta.preprocessedProfileVersion field,
  // then it is definitely a preprocessed profile.
  if ('meta' in profile && 'preprocessedProfileVersion' in profile.meta) {
    return true;
  }

  // This could also be a pre-version 1 profile.
  return 'threads' in profile &&
    profile.threads.length >= 1 &&
    'stringArray' in profile.threads[0];
}

/**
 * Upgrades the supplied profile to the current version, by mutating |profile|.
 * Throws an exception if the profile is too new.
 * @param {object} profile The "serialized" form of a preprocessed profile,
 *                         i.e. stringArray instead of stringTable.
 */
export function upgradePreprocessedProfileToCurrentVersion(profile: Object) {
  const profileVersion = profile.meta.preprocessedProfileVersion ||
    UNANNOTATED_VERSION;
  if (profileVersion === CURRENT_VERSION) {
    return;
  }

  if (profileVersion > CURRENT_VERSION) {
    throw new Error(
      `Unable to parse a preprocessed profile of version ${profileVersion} - are you running an outdated version of perf.html? ` +
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

  profile.meta.preprocessedProfileVersion = CURRENT_VERSION;
}

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
const _upgraders = {
  [1]: profile => {
    // Starting with version 1, markers are sorted.
    for (const thread of profile.threads) {
      sortDataTable(thread.markers, thread.markers.time, (a, b) => a - b);
    }

    // And threads have proper names and processType fields.
    for (const thread of profile.threads) {
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
  },
  [2]: profile => {
    // pdbName -> debugName
    for (const thread of profile.threads) {
      for (const lib of thread.libs) {
        if (!('debugName' in lib)) {
          lib.debugName = lib.pdbName;
          lib.path = lib.name;
          lib.name = lib.debugName.endsWith('.pdb') ? lib.debugName.substr(0, lib.debugName.length - 4) : lib.debugName;
          delete lib.pdbName;
          delete lib.pdbAge;
          delete lib.pdbSignature;
        }
      }
    }
  },
};
