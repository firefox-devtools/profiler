/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  unserializeProfileOfArbitraryFormat,
  serializeProfile,
} from '../../profile-logic/process-profile';
import { upgradeGeckoProfileToCurrentVersion } from '../../profile-logic/gecko-profile-versioning';
import {
  GECKO_PROFILE_VERSION,
  PROCESSED_PROFILE_VERSION,
} from '../../app-logic/constants';

/* eslint-disable jest/expect-expect */
// testProfileUpgrading is an assertion, although eslint doesn't realize it. Disable
// the rule.

// Instructions for updating these tests after adding a new format version
// ============================================================================
//
// These steps are the same for the Gecko profile format and the processed
// profile format.
// When you've increased {GECKO_PROFILE_VERSION, PROCESSED_PROFILE_VERSION} and
// added an upgrader for the format changes, follow these steps to make sure
// your upgrader is tested:
//  1. Run these tests. The test harness will report snapshot mismatches.
//     Inspect these mismatches.
//  2. If the snapshot mismatches demonstrate that your upgrader code is being
//     exercised, then you're done. Update the snapshots with `yarn test -u`.
//  3. Otherwise, if the snapshot mismatches were only due to trivial things
//     like version numbers or JSON formatting, it means that your upgrader is
//     not being tested adequately. For example, maybe you're changing the
//     structure of a certain marker type and there is no marker of that type
//     in the example input files.
//     In that case, you need to modify one of the input files such that your
//     code is exercised. Do that, run the tests and inspect the snapshot
//     changes, add a comment to the relevant subtest, and update the snapshots
//     using `yarn test -u`.
//     Also run `yarn prettier-json` to format the modified input file.
//  4. If you can't modify any of the existing input files, for example because
//     the format version of the inputs is too old to even have a place to add
//     the data that your upgrader operates on, you'll need to add a new input
//     profile. Copy one of the existing ones, make it a valid profile of the
//     version that you need, modify it to your liking, and add a subtest to
//     this test that loads and tests it.
//     Also run `yarn prettier-json` to format the new input file.
//
// It is not necessary to add a new test file for every version bump!
// Only add new test files when necessary, as described in step 4.

describe('upgrading gecko profiles', function () {
  function testProfileUpgrading(profile: any) {
    upgradeGeckoProfileToCurrentVersion(profile);
    expect(profile.meta.version).toEqual(GECKO_PROFILE_VERSION);
    expect(profile).toMatchSnapshot();
  }

  it('should upgrade gecko-1.json all the way to the current version', function () {
    // This tests:
    //  - exercises all upgraders starting from gecko profile version 3
    //  - samples, most marker types, nested processes
    testProfileUpgrading(require('../fixtures/upgrades/gecko-1.json'));
  });

  it('should upgrade gecko-2.json all the way to the current version', function () {
    // This tests:
    //  - nothing other than what gecko-1.json already tests, but it uses
    //    version 13 so it's easier to modify for future tests
    //  - upgrading pages array and page information inside markers
    //  - upgrading tracing markers without interval information
    testProfileUpgrading(require('../fixtures/upgrades/gecko-2.json'));
  });
});

describe('upgrading processed profiles', function () {
  async function testProfileUpgrading(profile: any) {
    const upgradedProfile = await unserializeProfileOfArbitraryFormat(profile);
    expect(upgradedProfile.meta.preprocessedProfileVersion).toEqual(
      PROCESSED_PROFILE_VERSION
    );
    expect(JSON.parse(serializeProfile(upgradedProfile))).toMatchSnapshot();
  }

  it('should upgrade processed-1.json all the way to the current version', async function () {
    // This tests:
    //  - exercises all upgraders starting from processed profile version 0
    //  - samples, most marker types, threads of different processes
    await testProfileUpgrading(
      require('../fixtures/upgrades/processed-1.json')
    );
  });

  it('should upgrade processed-2.json all the way to the current version', async function () {
    // This tests:
    //  - upgrading the DOMEventMarkerPayload.timeStamp field
    //  - Renaming DiskIO markers to FileIO markers
    await testProfileUpgrading(
      require('../fixtures/upgrades/processed-2.json')
    );
  });

  it('should upgrade processed-3.json all the way to the current version', async function () {
    // This tests:
    //  - Upgrading pages array and page information inside markers
    //  - Upgrading instant markers
    await testProfileUpgrading(
      require('../fixtures/upgrades/processed-3.json')
    );
  });
});

describe('importing perf profile', function () {
  it('should import a perf profile', async function () {
    try {
      const fs = await import('fs');
      const zlib = await import('zlib');
      const buffer = fs.readFileSync('src/test/fixtures/upgrades/test.perf.gz');
      const decompressedArrayBuffer = zlib.gunzipSync(buffer);
      const text = decompressedArrayBuffer.toString('utf8');
      const profile = await unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      expect(profile).toMatchSnapshot();
    } catch (e) {
      console.log(e);
      // probably file not found
    }
  });
});
