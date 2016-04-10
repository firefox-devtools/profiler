export function provideHostSide(workerFilename, methods) {
  return function HostClass() {
    const constructorArguments = Array.from(arguments);

    const worker = new Worker(workerFilename);
    const callbacks = new Map(); // msgID -> { resolve, reject }
    let nextMessageID = 0;

    worker.onmessage = ({ data }) => {
      const { msgID, type } = data;
      const { resolve, reject } = callbacks.get(msgID);
      callbacks.delete(msgID);
      if (type === 'success') {
        resolve(data.result);
      } else if (type === 'error') {
        reject(data.error);
      }
    }

    for (let method of methods) {
      this[method] = (function () {
        const paramArray = Array.from(arguments);
        const msgID = nextMessageID++;
        worker.postMessage({ msgID, type: 'method', method, paramArray });
        return new Promise((resolve, reject) => {
          callbacks.set(msgID, { resolve, reject });
        });
      }).bind(this);
    }

    worker.postMessage({ type: 'constructor', constructorArguments });
  }
}

export function provideWorkerSide(workerGlobal, theClass) {
  let theObject = null;
  workerGlobal.onmessage = ({ data }) => {
    if (data.type === 'constructor') {
      theObject = new theClass(...data.constructorArguments);
    } else if (data.type === 'method') {
      const { msgID, method, paramArray } = data;
      theObject[method](...paramArray).then(result => {
        workerGlobal.postMessage({ msgID, type: 'success', result });
      }, error => {
        workerGlobal.postMessage({ msgID, type: 'error', error: error.toString() });
      });
    }
  }
}
