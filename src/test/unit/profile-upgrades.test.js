/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  unserializeProfileOfArbitraryFormat,
  serializeProfile,
} from '../../profile-logic/process-profile';
import {
  isOldCleopatraFormat,
  convertOldCleopatraProfile,
} from '../../profile-logic/old-cleopatra-profile-format';
import {
  isProcessedProfile,
  upgradeProcessedProfileToCurrentVersion,
  CURRENT_PROCESSED_VERSION,
} from '../../profile-logic/processed-profile-versioning';
import {
  upgradeGeckoProfileToCurrentVersion,
  CURRENT_GECKO_VERSION,
} from '../../profile-logic/gecko-profile-versioning';

describe('upgrade processed profiles', function() {
  const referenceProfile: Object = require('../fixtures/upgrades/processed-7.json');
  delete referenceProfile.meta.version;

  // Processed profiles contain a stringTable which isn't easily comparable.
  // Instead, serialize the profiles first, so that the stringTable becomes a
  // stringArray, and compare the serialized versions.
  function getComparableProfile(profile: Object): Object {
    const comparableProfile = JSON.parse(serializeProfile(profile));
    delete comparableProfile.meta.version;
    return comparableProfile;
  }

  let profilesTested = 0;
  function checkProfile(version: number, profileJSON: Object) {
    it(`"profile-${version}.json" should be equal to the referenceProfile`, function() {
      expect(
        getComparableProfile(unserializeProfileOfArbitraryFormat(profileJSON))
      ).toEqual(referenceProfile);
    });
    profilesTested++;
  }

  checkProfile(7, require('../fixtures/upgrades/processed-7.json'));
  checkProfile(6, require('../fixtures/upgrades/processed-6.json'));
  checkProfile(5, require('../fixtures/upgrades/processed-5.json'));
  checkProfile(4, require('../fixtures/upgrades/processed-4.json'));
  checkProfile(3, require('../fixtures/upgrades/processed-3.json'));
  checkProfile(2, require('../fixtures/upgrades/processed-2.json'));
  checkProfile(1, require('../fixtures/upgrades/processed-1.json'));
  checkProfile(0, require('../fixtures/upgrades/processed-0.json'));

  /**
   * If this test fails, then a new processed-x.json needs to be added. Run the
   * following console.log to output a new one, then manually run it through
   * JSON.stringify(output, null, 2) to pretty print the output.
   */
  it('tests every processed profile', function() {
    // console.log(
    //   serializeProfile(
    //     unserializeProfileOfArbitraryFormat(
    //       require('../fixtures/upgrades/processed-0.json')
    //     )
    //   )
    // );

    expect(CURRENT_PROCESSED_VERSION + 1).toBe(profilesTested);
  });
});

describe('upgrade gecko profiles', function() {
  const referenceGeckoProfile = require('../fixtures/upgrades/gecko-7.json');
  expect(referenceGeckoProfile.meta.version).toEqual(CURRENT_GECKO_VERSION);

  let profilesTested = 0;
  function checkProfile(version: number, geckoProfile: Object) {
    it(`"gecko-${version}.json" should be equal to the referenceProfile`, function() {
      upgradeGeckoProfileToCurrentVersion(geckoProfile);
      expect(geckoProfile).toEqual(referenceGeckoProfile);
    });
    profilesTested++;
  }

  checkProfile(7, require('../fixtures/upgrades/gecko-7.json'));
  checkProfile(6, require('../fixtures/upgrades/gecko-6.json'));
  checkProfile(5, require('../fixtures/upgrades/gecko-5.json'));
  checkProfile(4, require('../fixtures/upgrades/gecko-4.json'));
  checkProfile(3, require('../fixtures/upgrades/gecko-3.json'));

  /**
   * If this test fails, then a new gecko-x.json needs to be added. Run the
   * following console.log to output a new one, then manually run it through
   * JSON.stringify(output, null, 2) to pretty print the output.
   */
  it('tests every processed profile', function() {
    // console.log(
    //   upgradeGeckoProfileToCurrentVersion(require('../fixtures/upgrades/gecko-3.json'))
    // );

    // Only test from version 3.
    const expectedProfilesTested = CURRENT_GECKO_VERSION - 2;
    expect(expectedProfilesTested).toBe(profilesTested);
  });
});

/**
 * This only lightly tests our conversion of old cleopatra formats to see that they
 * don't throw exceptions.
 */
describe('upgrade old cleopatra profiles', function() {
  const exampleOldCleopatraProfiles = [
    require('../fixtures/upgrades/old-cleopatra-profile.sps.json'),
    require('../fixtures/upgrades/ancient-cleopatra-profile.sps.json'),
  ];
  exampleOldCleopatraProfiles.forEach(exampleOldCleopatraProfile => {
    it('should detect the profile as an old cleopatra profile', function() {
      expect(isOldCleopatraFormat(exampleOldCleopatraProfile)).toBe(true);
    });
    it('should be able to convert the old cleopatra profile into a processed profile', function() {
      const profile = convertOldCleopatraProfile(exampleOldCleopatraProfile);
      expect(isProcessedProfile(profile)).toBe(true);
      // For now, just test that upgrading doesn't throw any exceptions.
      upgradeProcessedProfileToCurrentVersion(profile);
      expect(profile.threads.length).toBeGreaterThanOrEqual(1);
      expect(profile.threads[0].name).toBe('GeckoMain');
    });
  });
});
