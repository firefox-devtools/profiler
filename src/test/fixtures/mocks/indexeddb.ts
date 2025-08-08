/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file implements a fake indexeddb database using the fake-indexeddb
// library.

import { IDBFactory } from 'fake-indexeddb';

function resetIndexedDb() {
  // This is the recommended way to reset the IDB state between test runs, but
  // neither flow nor eslint like that we assign to indexedDB directly, for
  // different reasons.
  /* $FlowExpectError */ /* eslint-disable-next-line no-global-assign */
  indexedDB = new IDBFactory();
}

export function autoMockIndexedDB() {
  // fake-indexeddb no longer includes a structuredClone polyfill, so we need to
  // import it explicitly.
  require('core-js/stable/structured-clone');

  // This require has a side-effect that's not possible to have with a function
  // call, and that we want to happen only when calling autoMockIndexedDB.
  // That's why we require it instead of importing.
  require('fake-indexeddb/auto');

  beforeEach(resetIndexedDb);
  afterEach(resetIndexedDb);
}
