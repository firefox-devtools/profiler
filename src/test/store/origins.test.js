/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { getHumanReadableOriginTracks } from '../fixtures/profiles/tracks';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { viewProfile } from '../../actions/receive-profile';
import { ensureExists } from '../../utils/flow';
import createStore from '../../app-logic/create-store';

type TestDefinedOriginThread = {|
  name?: string,
  origin?: string,
  parentOrigin?: string,
  pid?: number,
|};

function getProfileWithOrigins(...originThreads: TestDefinedOriginThread[]) {
  let uniqueId = 1;
  const sampleNames = originThreads.map(({ name, origin }) => {
    if (name) {
      return name;
    }
    if (origin) {
      return origin;
    }
    throw new Error('Expected a name or origin.');
  });

  const { profile } = getProfileFromTextSamples(...sampleNames);
  const pages = ensureExists(profile.pages, 'Expected to find profile pages.');

  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];
    const { name, origin, parentOrigin, pid } = originThreads[threadIndex];
    if (origin) {
      // The arbitrary innerWindowID is set up to be the same as the thread index.
      const innerWindowID = threadIndex;
      let embedderInnerWindowID = 0;
      if (parentOrigin) {
        embedderInnerWindowID = originThreads.findIndex(
          other => other.origin === parentOrigin
        );
        if (embedderInnerWindowID === -1) {
          throw new Error('Could not find');
        }
      }
      pages.push({
        browsingContextID: uniqueId++,
        // The arbitrary innerWindowID is set up to be the same as the thread index.
        innerWindowID,
        url: origin,
        embedderInnerWindowID,
      });
      thread.frameTable.innerWindowID[0] = innerWindowID;
    }

    if (name) {
      thread.name = name;
    }
    thread.pid = pid === undefined ? threadIndex : pid;
  }

  return profile;
}

describe('origins timeline', function() {
  function setup(...originThreads: TestDefinedOriginThread[]) {
    const store = createStore();
    const profile = getProfileWithOrigins(...originThreads);
    const { dispatch } = store;
    const timelineTrackOrganization = { type: 'origins' };
    dispatch(viewProfile(profile, { timelineTrackOrganization }));
    return store;
  }

  it('can compute an origins based view', function() {
    const { getState } = setup(
      { name: `GeckoMain`, pid: 1 },
      { name: `Compositor`, pid: 1 },
      { origin: `https://AAAA.example.com` },
      {
        origin: `https://BBBB.example.com`,
        parentOrigin: `https://AAAA.example.com`,
      },
      {
        origin: `https://CCCC.example.com`,
        parentOrigin: `https://AAAA.example.com`,
      },
      { origin: `https://DDDD.example.com` },
      {
        origin: `https://EEEE.example.com`,
        parentOrigin: `https://DDDD.example.com`,
      },
      {
        origin: `https://FFFF.example.com`,
        parentOrigin: `https://DDDD.example.com`,
      },
      { name: `GeckoMain pid:(2)` },
      { name: `GeckoMain pid:(3)` }
    );
    expect(getHumanReadableOriginTracks(getState())).toEqual([
      'Parent Process',
      'Compositor',
      'GeckoMain pid:(2)',
      'GeckoMain pid:(3)',
      'https://aaaa.example.com',
      '  - https://bbbb.example.com',
      '  - https://cccc.example.com',
      'https://dddd.example.com',
      '  - https://eeee.example.com',
      '  - https://ffff.example.com',
    ]);
  });
});
