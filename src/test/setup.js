
// @flow
jest.mock('../utils/worker-factory');
// Disabling eslint for this line because this property is only part of the mock
import { shutdownWorkers } from '../utils/worker-factory'; // eslint-disable-line import/named

afterEach(function() {
  shutdownWorkers();
});
