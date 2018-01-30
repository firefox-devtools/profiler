
// @flow
import Worker from 'workerjs';

const workerFiles = {
  // Paths are relative to workerjs' requireworker.js file
  'zee-worker': '../../res/zee-worker.js',
};

const workerInstances = [];

export default class {
  constructor(file) {
    const worker = new Worker(workerFiles[file]);
    workerInstances.push(worker);
    return worker;
  }
}

export function shutdownWorkers() {
  workerInstances.forEach(worker => worker.terminate());
  workerInstances.length = 0;
}
