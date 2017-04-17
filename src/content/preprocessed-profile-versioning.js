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
import { resourceTypes } from './profile-data';
import { UniqueStringArray } from './unique-string-array';
import { timeCode } from '../common/time-code';

export const CURRENT_VERSION = 4; // The current version of the 'preprocessed profile' format.

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

function _archFromAbi(abi) {
  if (abi === 'x86_64-gcc3') {
    return 'x86_64';
  }
  return abi;
}

function _getRealScriptURI(url) {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
const _upgraders = {
  [1]: profile => {
    // Starting with version 1, markers are sorted.
    timeCode('sorting thread markers', () => {
      for (const thread of profile.threads) {
        sortDataTable(thread.markers, thread.markers.time, (a, b) => a - b);
      }
    });

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
    // pdbName -> debugName, add arch
    for (const thread of profile.threads) {
      for (const lib of thread.libs) {
        if (!('debugName' in lib)) {
          lib.debugName = lib.pdbName;
          lib.path = lib.name;
          lib.name = lib.debugName.endsWith('.pdb') ? lib.debugName.substr(0, lib.debugName.length - 4) : lib.debugName;
          lib.arch = _archFromAbi(profile.meta.abi);
          delete lib.pdbName;
          delete lib.pdbAge;
          delete lib.pdbSignature;
        }
      }
    }
  },
  [3]: profile => {
    // Make sure every lib has a debugPath property. We can't infer this
    // value from the other properties on the lib so we just set it to the
    // empty string.
    for (const thread of profile.threads) {
      for (const lib of thread.libs) {
        lib.debugPath = lib.debugPath || '';
      }
    }
  },
  [4]: profile => {
    profile.threads.forEach(thread => {
      const { funcTable, stringArray, resourceTable } = thread;
      const stringTable = new UniqueStringArray(stringArray);

      // resourceTable gains a new field ("host") and a new resourceType:
      // "webhost". Resources from http and https URLs are now grouped by
      // origin (protocol + host) into one webhost resource, instead of being
      // separate per-URL resources.
      // That means that multiple old resources can collapse into one new
      // resource. We need to keep track of such collapsing (using the
      // oldResourceToNewResourceMap) and then execute apply the changes to
      // the resource pointers in the funcTable.
      const newResourceTable = {
        length: 0,
        type: [],
        name: [],
        lib: [],
        icon: [],
        addonId: [],
        host: [],
      };
      function addLibResource(name, lib) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.library;
        newResourceTable.name[index] = name;
        newResourceTable.lib[index] = lib;
      }
      function addWebhostResource(origin, host) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.webhost;
        newResourceTable.name[index] = origin;
        newResourceTable.host[index] = host;
      }
      function addURLResource(url) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.url;
        newResourceTable.name[index] = url;
      }
      const oldResourceToNewResourceMap = new Map();
      const originToResourceIndex = new Map();
      for (let resourceIndex = 0; resourceIndex < resourceTable.length; resourceIndex++) {
        if (resourceTable.type[resourceIndex] === resourceTypes.library) {
          oldResourceToNewResourceMap.set(resourceIndex, newResourceTable.length);
          addLibResource(resourceTable.name[resourceIndex], resourceTable.lib[resourceIndex]);
        } else if (resourceTable.type[resourceIndex] === resourceTypes.url) {
          const scriptURI = stringTable.getString(resourceTable.name[resourceIndex]);
          let newResourceIndex = null;
          let origin, host;
          try {
            const url = new URL(scriptURI);
            if (!(url.protocol === 'http:' || url.protocol === 'https:')) {
              throw new Error('not a webhost protocol');
            }
            origin = url.origin;
            host = url.host;
          } catch (e) {
            origin = scriptURI;
            host = null;
          }
          if (originToResourceIndex.has(origin)) {
            newResourceIndex = originToResourceIndex.get(origin);
          } else {
            newResourceIndex = newResourceTable.length;
            originToResourceIndex.set(origin, newResourceIndex);
            const originStringIndex = stringTable.indexForString(origin);
            if (host) {
              const hostIndex = stringTable.indexForString(host);
              addWebhostResource(originStringIndex, hostIndex);
            } else {
              const urlStringIndex = stringTable.indexForString(scriptURI);
              addURLResource(urlStringIndex);
            }
          }
          oldResourceToNewResourceMap.set(resourceIndex, newResourceIndex);
        }
      }

      // funcTable gains two new fields: fileName and lineNumber. For C++ and
      // pseudo stack funcs, these fields are null. For JS funcs, they contain
      // the URL and the line number of the JS function.
      funcTable.fileName = [];
      funcTable.lineNumber = [];
      for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
        const oldResourceIndex = funcTable.resource[funcIndex];
        if (oldResourceToNewResourceMap.has(oldResourceIndex)) {
          funcTable.resource[funcIndex] = oldResourceToNewResourceMap.get(oldResourceIndex);
        }
        let fileName = null;
        let lineNumber = null;
        if (funcTable.isJS[funcIndex]) {
          const funcName = stringTable.getString(funcTable.name[funcIndex]);
          const match =
            /^(.*) \((.*):([0-9]+)\)$/.exec(funcName) ||
            /^()(.*):([0-9]+)$/.exec(funcName);
          if (match) {
            const scriptURI = _getRealScriptURI(match[2]);
            if (match[1]) {
              funcTable.name[funcIndex] = stringTable.indexForString(match[1]);
            } else {
              funcTable.name[funcIndex] = stringTable.indexForString(scriptURI);
            }
            fileName = stringTable.indexForString(scriptURI);
            lineNumber = match[3] | 0;
          }
        }
        funcTable.fileName[funcIndex] = fileName;
        funcTable.lineNumber[funcIndex] = lineNumber;
      }

      thread.resourceTable = newResourceTable;
      thread.stringArray = stringTable.serializeToArray();
    });
  },
};
