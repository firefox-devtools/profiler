/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This file contains the code responsible for storing informations about
// published profiles.

import { openDB, deleteDB } from 'idb';
import type { DB as Database } from 'idb';
import type { StartEndRange } from 'firefox-profiler/types';

export type ProfileData = {|
  +profileToken: string, // This is the primary key.
  +jwtToken: string | null,
  +publishedDate: Date,
  +name: string,
  +preset: string | null,
  +originHostname: string | null,
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
    +toolkit?: 'gtk' | 'windows' | 'cocoa' | 'android' | string,
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
export const DATABASE_VERSION = 1;

async function reallyOpen(): Promise<Database> {
  const db = await openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(OBJECTSTORE_NAME, {
        keyPath: 'profileToken',
      });
      store.createIndex('originHostname', 'originHostname');
    },
    blocked() {
      // Ideally we should throw this error, but idb doesn't allow this, so
      // instead we just output this in the console.
      // See https://github.com/jakearchibald/idb/issues/186
      console.error(
        new Error(
          'The published profiles store database could not be upgraded because it is ' +
            'open in another tab. Please close all your other profiler.firefox.com ' +
            'tabs and refresh.'
        )
      );
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
      // We delete the database and try again.
      await deleteDB(DATABASE_NAME);
      db = await reallyOpen();
    } else {
      throw e;
    }
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
  return db.getAll(OBJECTSTORE_NAME);
}

export async function retrieveProfileData(
  profileToken: string
): Promise<ProfileData> {
  const db = await open();
  return db.get(OBJECTSTORE_NAME, profileToken);
}
