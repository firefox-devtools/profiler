// @flow
/**
 * This file deals with old versions of the "raw" profile format, i.e. the
 * format that the Gecko profiler platform outputs. We want to be able to
 * run perf.html on non-Nightly versions of Firefox, and we want to be able
 * to load old saved profiles, so this file upgrades old profiles to the
 * current format.
*/

export const CURRENT_VERSION = 3; // The current version of the 'raw profile' format.

// Raw profiles before version 1 did not have a profile.meta.version field.
// Treat those as version zero.
const UNANNOTATED_VERSION = 0;

/**
 * Upgrades the supplied profile to the current version, by mutating |profile|.
 * Throws an exception if the profile is too new.
 * @param {object} profile The profile in the "raw profile" format.
 */
export function upgradeRawProfileToCurrentVersion(profile: Object) {
  const profileVersion = profile.meta.version || UNANNOTATED_VERSION;
  if (profileVersion === CURRENT_VERSION) {
    return;
  }

  if (profileVersion > CURRENT_VERSION) {
    throw new Error(
      `Unable to parse a raw profile of version ${profileVersion} - are you running an outdated version of perf.html? ` +
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

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
const _upgraders = {
  [1]: () => {
    throw new Error(
      'Raw profiles without version numbers are very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [2]: () => {
    throw new Error(
      'Raw profile version 1 is very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [3]: () => {
    throw new Error(
      'Raw profile version 2 is very old and no conversion code has been written for that version of the profile format.'
    );
  },
};
