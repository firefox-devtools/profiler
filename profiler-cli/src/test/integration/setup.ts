/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Jest setup for CLI integration tests.
 * These tests only need jest-extended, not the full browser test setup.
 */

// Importing this makes jest-extended matchers available everywhere
import 'jest-extended/all';
