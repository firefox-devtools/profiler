/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This file contains the code responsible for storing informations about
// published profiles.

import { openDB, deleteDB } from 'idb';
import { stripIndent } from 'common-tags';
import { ensureExists } from 'firefox-profiler/utils/flow';

import type { DB as Database } from 'idb';
import type { StartEndRange } from 'firefox-profiler/types';

export type ProfileData = {|
  +profileToken: string, // This is the primary key.
  +jwtToken: string | null,
  +publishedDate: Date, // This key is indexed as well, to provide automatic sorting.
  +name: string,
  +preset: string | null,
  +originHostname: string | null, // This key is indexed as well.
  +meta: {|
    // We're using some of the properties of the profile meta, but we're not
    // reusing the type ProfileMeta completely because we don't want to be
    // impacted from future changes to ProfileMeta.
    // Look at ProfileMeta definition to know more about these fields.
    +product: string,
    +abi?: string,
    +platform?:
      | 'Android'
      | 'Windows'
      | 'Macintosh'
      // X11 is used for historic reasons, but this value means that it is a Unix platform.
      | 'X11'
      | string,
    +toolkit?: string,
    +misc?: string,
    +oscpu?: string,
    // Older versions of Firefox for Linux had the 2 flavors gtk2/gtk3, and so
    // we could find the value "gtk3".
    +toolkit?: 'gtk' | 'gtk3' | 'windows' | 'cocoa' | 'android' | string,
    +updateChannel?:
      | 'default' // Local builds
      | 'nightly'
      | 'nightly-try' // Nightly try builds for QA
      | 'aurora' // Developer Edition channel
      | 'beta'
      | 'release'
      | 'esr' // Extended Support Release channel
      | string,
    +appBuildID?: string,
  |},
  // Storing the state as the path makes it easy to reuse our URL upgrade mechanism.
  +urlPath: string,
  +publishedRange: StartEndRange,
|};

// Exported for tests.
export const DATABASE_NAME = 'published-profiles-store';
export const OBJECTSTORE_NAME = 'published-profiles';
export const DATABASE_VERSION = 2;

async function reallyOpen(): Promise<Database> {
  const db = await openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // In the following switch block, we don't "break" for each case block
      // because we want to run all migration steps in sequence, starting with
      // the right step.
      /* eslint-disable no-fallthrough */
      switch (oldVersion) {
        case 0: {
          // Version 1: this is the first version of the DB.
          const store = db.createObjectStore(OBJECTSTORE_NAME, {
            keyPath: 'profileToken',
          });
          store.createIndex('originHostname', 'originHostname');
        }
        case 1: {
          // Version 2: we create a new index to allow retrieving the values
          // ordered by date.
          const store = ensureExists(transaction.store);
          store.createIndex('publishedDate', 'publishedDate');
        }
        default:
        // Nothing more here.
      }
      /* eslint-enable */
    },
  });

  return db;
}

async function open(): Promise<Database> {
  if (!window.indexedDB) {
    throw new Error('Could not find indexedDB on the window object.');
  }

  let db;
  try {
    db = await reallyOpen();
  } catch (e) {
    if (e.name === 'VersionError') {
      // This error fires if the database already exists, and the existing
      // database has a higher version than what we requested. So either
      // this version of profiler.firefox.com is outdated, or somebody briefly tried
      // to change this database format (and increased the version number)
      // and then downgraded to a version of profiler.firefox.com without those
      // changes.
      // Let's explain that in an error, that will be output to the console by
      // the caller.
      (window: any).deleteDB = () => deleteDB(DATABASE_NAME);
      throw new Error(stripIndent`
        We tried to open an existing published profiles store database with a
        smaller version than the current one. We can't do that with IndexedDB.
        The only way to recover is to delete the database and create a new one,
        but we don't want to do this automatically.
        Until this is fixed we won't be able to store newly published profiles
        or retrieve previously published profiles.

        If you want to delete the database, you can do so by running 'deleteDB()'
        in the console, or using the developer tools.
      `);
    }
    throw e;
  }

  return db;
}

export async function storeProfileData(
  profileData: ProfileData
): Promise<void> {
  const db = await open();
  await db.put(OBJECTSTORE_NAME, profileData);
}

export async function listAllProfileData(): Promise<ProfileData[]> {
  const db = await open();
  return db.getAllFromIndex(OBJECTSTORE_NAME, 'publishedDate');
}

export async function retrieveProfileData(
  profileToken: string
): Promise<ProfileData | void> {
  const db = await open();
  return db.get(OBJECTSTORE_NAME, profileToken);
}

export async function deleteProfileData(profileToken: string): Promise<void> {
  const db = await open();
  return db.delete(OBJECTSTORE_NAME, profileToken);
}
