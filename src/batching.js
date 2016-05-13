let scheduledBatch = false;
let enqueuedFunctions = [];

function runBatch() {
  scheduledBatch = false;
  const functionsToRun = enqueuedFunctions;
  enqueuedFunctions = [];
  console.log(`running ${functionsToRun.length} enqueued functions in one go.`);
  functionsToRun.forEach(fun => fun());
}

export function enqueueForBatching(fun) {
  console.log('pushing a new fun for batching');
  enqueuedFunctions.push(fun);
  if (!scheduledBatch) {
    setTimeout(runBatch, 0);
    scheduledBatch = true;
  }
}
