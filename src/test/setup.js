jest.mock('../content/worker-factory');
// Disabling eslint for this line because this property is only part of the mock
import { shutdownWorkers } from '../content/worker-factory'; // eslint-disable-line import/named

afterEach(function () {
  shutdownWorkers();
});
