import ZeeWorker from 'worker-loader!./zee-worker';

export function gzipString(str) {
  return new Promise(resolve => {
    const zeeWorker = new ZeeWorker();
    zeeWorker.onmessage = function(msg) {
      resolve(msg.data.data);
    };

    const encoder = new window.TextEncoder();
    const dataAsArrayBuffer = encoder.encode(str);
    zeeWorker.postMessage({
      data: dataAsArrayBuffer
    }, [dataAsArrayBuffer.buffer]);
  });
}
