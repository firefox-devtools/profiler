/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file contains the code responsible for storing informations about
// published profiles.

import type { IDBPDatabase } from 'idb';
import { openDB, deleteDB } from 'idb';
import { stripIndent } from 'common-tags';
import {
  stateFromLocation,
  urlFromState,
} from 'firefox-profiler/app-logic/url-handling';

import type { StartEndRange } from 'firefox-profiler/types';

// This type is closely tied to the IndexedDB operation. Indeed it represents
// the data we store and retrieve in the local DB. That's especially why it's
// defined in this file, close to the DB operations. Indeed we don't want that
// this type evolves without implementing a migration step for the stored data.
export type UploadedProfileInformation = {
  readonly profileToken: string; // This is the primary key.
  readonly jwtToken: string | null;
  readonly publishedDate: Date; // This key is indexed as well, to provide automatic sorting.
  readonly name: string;
  readonly preset: string | null;
  readonly meta: {
    // We're using some of the properties of the profile meta, but we're not
    // reusing the type ProfileMeta completely because we don't want to be
    // impacted from future changes to ProfileMeta.
    // Look at ProfileMeta definition to know more about these fields.
    readonly product: string;
    readonly abi?: string;
    readonly platform?:
      | 'Android'
      | 'Windows'
      | 'Macintosh'
      // X11 is used for historic reasons, but this value means that it is a Unix platform.
      | 'X11'
      | string;
    readonly misc?: string;
    readonly oscpu?: string;
    // Older versions of Firefox for Linux had the 2 flavors gtk2/gtk3, and so
    // we could find the value "gtk3".
    readonly toolkit?:
      | 'gtk'
      | 'gtk3'
      | 'windows'
      | 'cocoa'
      | 'android'
      | string;
    readonly updateChannel?:
      | 'default' // Local builds
      | 'nightly'
      | 'nightly-try' // Nightly try builds for QA
      | 'aurora' // Developer Edition channel
      | 'beta'
      | 'release'
      | 'esr' // Extended Support Release channel
      | string;
    readonly appBuildID?: string;
  };
  // Storing the state as the path makes it easy to reuse our URL upgrade mechanism.
  readonly urlPath: string;
  readonly publishedRange: StartEndRange;
};

// Exported for tests.
export const DATABASE_NAME = 'published-profiles-store';
export const OBJECTSTORE_NAME = 'published-profiles';
export const DATABASE_VERSION = 3;

async function reallyOpen(): Promise<IDBPDatabase> {
  const db = await openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      // Run all migration steps in sequence.
      if (oldVersion < 1) {
        // Version 1: this is the first version of the DB.
        const store = db.createObjectStore(OBJECTSTORE_NAME, {
          keyPath: 'profileToken',
        });
        store.createIndex('originHostname', 'originHostname');
      }
      if (oldVersion < 2) {
        // Version 2: we create a new index to allow retrieving the values
        // ordered by date.
        const store = transaction.objectStore(OBJECTSTORE_NAME);
        store.createIndex('publishedDate', 'publishedDate');
      }
      if (oldVersion < 3) {
        // Version 3: we remove the originHostname index that was used by the
        // active tab view since it's been removed.
        const store = transaction.objectStore(OBJECTSTORE_NAME);
        store.deleteIndex('originHostname');
      }
    },
  });

  return db;
}

declare global {
  interface Window {
    deleteDB?: () => void;
  }
}

async function open(): Promise<IDBPDatabase> {
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
      window.deleteDB = () => deleteDB(DATABASE_NAME);
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

/**
 * This stores some profile data. The profileToken property is the primary key,
 * so this also updates any profile data already there with the same
 * profileToken information.
 */
export async function persistUploadedProfileInformationToDb(
  uploadedProfileInformation: UploadedProfileInformation
): Promise<void> {
  const db = await open();
  await db.put(OBJECTSTORE_NAME, uploadedProfileInformation);
}

/**
 * This returns the list of all the stored data.
 */
export async function listAllUploadedProfileInformationFromDb(): Promise<
  UploadedProfileInformation[]
> {
  const db = await open();
  return db.getAllFromIndex(OBJECTSTORE_NAME, 'publishedDate');
}

/**
 * This returns the profile data for a specific stored token, or undefined
 * otherwise.
 */
export async function retrieveUploadedProfileInformationFromDb(
  profileToken: string
): Promise<UploadedProfileInformation | null> {
  if (!profileToken) {
    // If this is the empty string, let's skip the lookup.
    return null;
  }

  const db = await open();
  const result = await db.get(OBJECTSTORE_NAME, profileToken);
  return result || null;
}

/**
 * This deletes the profile data stored with this token. This is a no-op if this
 * token isn't in the database.
 */
export async function deleteUploadedProfileInformationFromDb(
  profileToken: string
): Promise<void> {
  const db = await open();
  return db.delete(OBJECTSTORE_NAME, profileToken);
}

/**
 * This changes the profile name of a stored profile data. This is a no-op if
 * this token isn't in the database.
 */
export async function changeStoredProfileNameInDb(
  profileToken: string,
  profileName: string
): Promise<void> {
  const storedProfile =
    await retrieveUploadedProfileInformationFromDb(profileToken);
  if (storedProfile && storedProfile.name !== profileName) {
    // We need to update the name, but also the urlPath. For this we'll convert
    // the old one to a state, and convert it back to a url string, so that
    // there is less chance that we forget about this case if we update the
    // state object.

    // `stateFromLocation` waits for something that looks like a Location
    // object. We use the URL object for this, but it requires a full URL, even
    // if `stateFromLocation` doesn't need one.
    const oldState = stateFromLocation(
      new URL(storedProfile.urlPath, window.location.href)
    );
    const newUrlPath = urlFromState({ ...oldState, profileName });

    const newUploadedProfileInformation = {
      ...storedProfile,
      name: profileName,
      urlPath: newUrlPath,
    };
    await persistUploadedProfileInformationToDb(newUploadedProfileInformation);
  }
}
