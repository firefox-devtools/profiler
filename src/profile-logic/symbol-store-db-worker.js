/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import SymbolStoreDB from './symbol-store-db';
import { provideWorkerSide } from '../utils/promise-worker';

provideWorkerSide(self, SymbolStoreDB);
