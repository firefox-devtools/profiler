// @flow
import { getEmptyProfile } from '../../../profile-data';
import { UniqueStringArray } from '../../../unique-string-array';
import type { Profile, Thread } from '../../../../common/types/profile';

export function getProfileWithNamedThreads(threadNames: string[]): Profile {
  const profile = getEmptyProfile();
  profile.threads = threadNames.map(name => getEmptyThread({ name }));
  return profile;
}

export function getEmptyThread(overrides: Object): Thread {
  return Object.assign({
    processType: 'default',
    name: 'Empty',
    pid: 0,
    tid: 0,
    samples: {
      frameNumber: [],
      responsiveness: [],
      stack: [],
      time: [],
      rss: [],
      uss: [],
      length: 0,
    },
    markers: {
      data: [],
      name: [],
      time: [],
      length: 0,
    },
    stackTable: {
      frame: [],
      prefix: [],
      length: 0,
    },
    frameTable: {
      address: [],
      category: [],
      func: [],
      implementation: [],
      line: [],
      optimizations: [],
      length: 0,
    },
    stringTable: new UniqueStringArray(),
    libs: [],
    funcTable: {
      address: [],
      libs: [],
      isJS: false,
      name: [],
      resource: [],
      fileName: [],
      lineNumber: [],
      length: 0,
    },
    resourceTable: {
      addonId: [],
      icon: [],
      length: 0,
      lib: [],
      name: [],
      type: 0,
    },
  }, overrides);
}
