/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import Enzyme from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { createSerializer } from 'enzyme-to-json';

Enzyme.configure({ adapter: new Adapter() });
expect.addSnapshotSerializer(createSerializer({ mode: 'deep' }));

jest.mock('../utils/worker-factory');
import * as WorkerFactory from '../utils/worker-factory';

afterEach(function() {
  // This `__shutdownWorkers` function only exists in the mocked test environment,
  // do not use flow typing on it.
  const { __shutdownWorkers } = (WorkerFactory: Object);
  __shutdownWorkers();
});
