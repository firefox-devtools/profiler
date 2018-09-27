/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  isOldCleopatraFormat,
  convertOldCleopatraProfile,
} from '../../profile-logic/old-cleopatra-profile-format';
import {
  isProcessedProfile,
  upgradeProcessedProfileToCurrentVersion,
  CURRENT_VERSION as CURRENT_PROCESSED_VERSION,
} from '../../profile-logic/processed-profile-versioning';
import {
  unserializeProfileOfArbitraryFormat,
  serializeProfile,
} from '../../profile-logic/process-profile';
import {
  upgradeGeckoProfileToCurrentVersion,
  CURRENT_VERSION as CURRENT_GECKO_VERSION,
} from '../../profile-logic/gecko-profile-versioning';

describe('upgrading old cleopatra profiles', function() {
  const oldCleopatraProfile = require('../fixtures/upgrades/old-cleopatra-profile.sps.json');
  const ancientCleopatraProfile = require('../fixtures/upgrades/ancient-cleopatra-profile.sps.json');

  function testConvertedCleopatraProfile(profile) {
    expect(isProcessedProfile(profile)).toBe(true);
    // For now, just test that upgrading doesn't throw any exceptions.
    upgradeProcessedProfileToCurrentVersion(profile);
    expect(profile.threads.length).toBeGreaterThanOrEqual(1);
    expect(profile.threads[0].name).toBe('GeckoMain');
  }

  it('should detect an old profile', function() {
    expect(isOldCleopatraFormat(oldCleopatraProfile)).toBe(true);
  });

  it('should detect an ancient profile', function() {
    expect(isOldCleopatraFormat(ancientCleopatraProfile)).toBe(true);
  });

  it('should be able to convert the old cleopatra profile into a processed profile', function() {
    testConvertedCleopatraProfile(
      convertOldCleopatraProfile(oldCleopatraProfile)
    );
  });

  it('should be able to convert the ancient cleopatra profile into a processed profile', function() {
    testConvertedCleopatraProfile(
      convertOldCleopatraProfile(ancientCleopatraProfile)
    );
  });

  // Executing this only for oldCleopatraProfile because
  // ancientCleopatraProfile doesn't have any causes for markers.
  it('should be able to convert causes from old cleopatra profiles', function() {
    const profile = unserializeProfileOfArbitraryFormat(oldCleopatraProfile);

    const [thread] = profile.threads;
    const { markers } = thread;

    const markerWithCauseIndex = markers.data.findIndex(
      marker => marker !== null && marker.type === 'tracing' && marker.cause
    );

    if (markerWithCauseIndex < -1) {
      throw new Error('We should have found one marker with a cause!');
    }

    const markerNameIndex = markers.name[markerWithCauseIndex];
    expect(thread.stringTable.getString(markerNameIndex)).toEqual('Styles');

    const markerWithCause = markers.data[markerWithCauseIndex];

    // This makes Flow happy
    if (
      markerWithCause === null ||
      markerWithCause === undefined ||
      markerWithCause.type !== 'tracing' ||
      !markerWithCause.cause
    ) {
      throw new Error('This marker should have a cause!');
    }

    // This is the stack we should get
    expect(markerWithCause).toEqual({
      category: 'Paint',
      cause: { stack: 10563, time: 4195720.505958 },
      interval: 'start',
      type: 'tracing',
    });
  });
});

describe('upgrading processed profiles', function() {
  function compareProcessedProfiles(lhs, rhs) {
    // Processed profiles contain a stringTable which isn't easily comparable.
    // Instead, serialize the profiles first, so that the stringTable becomes a
    // stringArray, and compare the serialized versions.
    const serializedLhsAsObject = JSON.parse(serializeProfile(lhs));
    const serializedRhsAsObject = JSON.parse(serializeProfile(rhs));

    // Don't compare the version of the Gecko profile that these profiles originated from.
    delete serializedLhsAsObject.meta.version;
    delete serializedRhsAsObject.meta.version;

    expect(serializedLhsAsObject).toEqual(serializedRhsAsObject);
  }

  const latestProcessedProfile = require('../fixtures/upgrades/processed-16.json');
  const afterUpgradeReference = unserializeProfileOfArbitraryFormat(
    latestProcessedProfile
  );

  // Uncomment this to output your next ./upgrades/processed-X.json
  // console.log(serializeProfile(afterUpgradeReference));
  // Then run prettier on it with the following command:
  //   yarn run prettier --write <file name>
  expect(latestProcessedProfile.meta.preprocessedProfileVersion).toEqual(
    CURRENT_PROCESSED_VERSION
  );

  it('should upgrade version 0', function() {
    const serializedOldProcessedProfile0 = require('../fixtures/upgrades/processed-0.json');
    const upgradedProfile0 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile0
    );
    compareProcessedProfiles(upgradedProfile0, afterUpgradeReference);
  });
  it('should upgrade version 1', function() {
    const serializedOldProcessedProfile1 = require('../fixtures/upgrades/processed-1.json');
    const upgradedProfile1 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile1
    );
    compareProcessedProfiles(upgradedProfile1, afterUpgradeReference);
  });
  it('should upgrade version 2', function() {
    const serializedOldProcessedProfile2 = require('../fixtures/upgrades/processed-2.json');
    const upgradedProfile2 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile2
    );
    compareProcessedProfiles(upgradedProfile2, afterUpgradeReference);
  });
  it('should upgrade version 3', function() {
    const serializedOldProcessedProfile3 = require('../fixtures/upgrades/processed-3.json');
    const upgradedProfile3 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile3
    );
    compareProcessedProfiles(upgradedProfile3, afterUpgradeReference);
  });
  it('should upgrade version 4', function() {
    const serializedOldProcessedProfile4 = require('../fixtures/upgrades/processed-4.json');
    const upgradedProfile4 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile4
    );
    compareProcessedProfiles(upgradedProfile4, afterUpgradeReference);
  });
  it('should upgrade version 5', function() {
    const serializedOldProcessedProfile5 = require('../fixtures/upgrades/processed-5.json');
    const upgradedProfile5 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile5
    );
    compareProcessedProfiles(upgradedProfile5, afterUpgradeReference);
  });
  it('should upgrade version 6', function() {
    const serializedOldProcessedProfile6 = require('../fixtures/upgrades/processed-6.json');
    const upgradedProfile6 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile6
    );
    compareProcessedProfiles(upgradedProfile6, afterUpgradeReference);
  });
  it('should upgrade version 7', function() {
    const serializedOldProcessedProfile7 = require('../fixtures/upgrades/processed-7.json');
    const upgradedProfile7 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile7
    );
    compareProcessedProfiles(upgradedProfile7, afterUpgradeReference);
  });
  it('should upgrade version 8', function() {
    // processed-7a to processed-8a is testing that we properly
    // upgrade the DOMEventMarkerPayload.timeStamp field.
    const serializedOldProcessedProfile7a = require('../fixtures/upgrades/processed-7a.json');
    const afterUpgradeReference8a = unserializeProfileOfArbitraryFormat(
      require('../fixtures/upgrades/processed-8a.json')
    );
    const upgradedProfile7a = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile7a
    );
    compareProcessedProfiles(upgradedProfile7a, afterUpgradeReference8a);
  });
  it('should upgrade version 9', function() {
    const serializedOldProcessedProfile8 = require('../fixtures/upgrades/processed-8.json');
    const upgradedProfile8 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile8
    );
    compareProcessedProfiles(upgradedProfile8, afterUpgradeReference);
  });
  it('should upgrade version 10', function() {
    const serializedOldProcessedProfile9 = require('../fixtures/upgrades/processed-9.json');
    const upgradedProfile9 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile9
    );
    compareProcessedProfiles(upgradedProfile9, afterUpgradeReference);
  });
  it('should upgrade version 11', function() {
    const serializedOldProcessedProfile11 = require('../fixtures/upgrades/processed-11.json');
    const upgradedProfile11 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile11
    );
    compareProcessedProfiles(upgradedProfile11, afterUpgradeReference);
  });
  it('should upgrade version 12', function() {
    const serializedOldProcessedProfile12 = require('../fixtures/upgrades/processed-12.json');
    const upgradedProfile12 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile12
    );
    compareProcessedProfiles(upgradedProfile12, afterUpgradeReference);
  });
  it('should upgrade version 13', function() {
    // This last test is to make sure we properly upgrade the json
    // file to same version
    const serializedOldProcessedProfile13 = require('../fixtures/upgrades/processed-13.json');
    const upgradedProfile13 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile13
    );
    compareProcessedProfiles(upgradedProfile13, afterUpgradeReference);
  });
  it('should upgrade version 14', function() {
    const serializedOldProcessedProfile14 = require('../fixtures/upgrades/processed-14.json');
    const upgradedProfile14 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile14
    );
    compareProcessedProfiles(upgradedProfile14, afterUpgradeReference);
  });
  it('should upgrade version 15', function() {
    const serializedOldProcessedProfile15 = require('../fixtures/upgrades/processed-15.json');
    const upgradedProfile15 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile15
    );
    compareProcessedProfiles(upgradedProfile15, afterUpgradeReference);
  });
  it('should still process a profile of the current version with no issues', function() {
    const serializedOldProcessedProfile16 = require('../fixtures/upgrades/processed-16.json');
    const upgradedProfile16 = unserializeProfileOfArbitraryFormat(
      serializedOldProcessedProfile16
    );
    compareProcessedProfiles(upgradedProfile16, afterUpgradeReference);
  });
});

describe('upgrading gecko profiles', function() {
  const afterUpgradeGeckoReference = require('../fixtures/upgrades/gecko-13.json');
  // Uncomment this to output your next ./upgrades/gecko-X.json
  // upgradeGeckoProfileToCurrentVersion(afterUpgradeGeckoReference);
  // console.log(JSON.stringify(afterUpgradeGeckoReference));
  // Then run prettier on it with the following command:
  //   yarn run prettier --write <file name>
  expect(afterUpgradeGeckoReference.meta.version).toEqual(
    CURRENT_GECKO_VERSION
  );

  it('should upgrade version 3', function() {
    const geckoProfile3 = require('../fixtures/upgrades/gecko-3.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile3);
    expect(geckoProfile3).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 4', function() {
    const geckoProfile4 = require('../fixtures/upgrades/gecko-4.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile4);
    expect(geckoProfile4).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 5', function() {
    const geckoProfile5 = require('../fixtures/upgrades/gecko-5.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile5);
    expect(geckoProfile5).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 6', function() {
    const geckoProfile6 = require('../fixtures/upgrades/gecko-6.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile6);
    expect(geckoProfile6).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 7', function() {
    const geckoProfile7 = require('../fixtures/upgrades/gecko-7.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile7);
    expect(geckoProfile7).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 8', function() {
    const geckoProfile8 = require('../fixtures/upgrades/gecko-8.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile8);
    expect(geckoProfile8).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 9', function() {
    const geckoProfile9 = require('../fixtures/upgrades/gecko-9.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile9);
    expect(geckoProfile9).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 10', function() {
    const geckoProfile10 = require('../fixtures/upgrades/gecko-10.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile10);
    expect(geckoProfile10).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 11', function() {
    const geckoProfile11 = require('../fixtures/upgrades/gecko-11.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile11);
    expect(geckoProfile11).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 12', function() {
    const geckoProfile12 = require('../fixtures/upgrades/gecko-12.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile12);
    expect(geckoProfile12).toEqual(afterUpgradeGeckoReference);
  });
  it('should upgrade version 13', function() {
    // This last test is to make sure we properly upgrade the json
    // file to same version
    const geckoProfile13 = require('../fixtures/upgrades/gecko-13.json');
    upgradeGeckoProfileToCurrentVersion(geckoProfile13);
    expect(geckoProfile13).toEqual(afterUpgradeGeckoReference);
  });
});

describe('importing perf profile', function() {
  it('should import a perf profile', function() {
    let version = -1;
    try {
      const fs = require('fs');
      const zlib = require('zlib');
      const buffer = fs.readFileSync('src/test/fixtures/upgrades/test.perf.gz');
      const decompressedArrayBuffer = zlib.gunzipSync(buffer);
      const text = decompressedArrayBuffer.toString('utf8');
      const profile = unserializeProfileOfArbitraryFormat(text);
      if (profile === undefined) {
        throw new Error('Unable to parse the profile.');
      }
      version = profile.meta.version;
      expect(profile).toMatchSnapshot();
    } catch (e) {
      console.log(e)
      // probably file not found
    }
    expect(version).toEqual(CURRENT_GECKO_VERSION);
  });
});
