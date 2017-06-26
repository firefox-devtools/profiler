import Worker from 'workerjs';

const workerFiles = {
  'zee-worker': '../../res/zee-worker.js',
  'worker': '../../dist/worker.js',
};

const workerInstances = [];

export default class {
  constructor(file) {
    const worker = new Worker(workerFiles[file], true);
    workerInstances.push(worker);
    return worker;
  }
}

export function shutdownWorkers() {
  workerInstances.forEach(worker => worker.terminate());
  workerInstances.length = 0;
}
