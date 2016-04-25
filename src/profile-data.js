import { timeCode } from './time-code';

/**
 * Various helpers for dealing with the profile as a data structure.
 */

export const resourceTypes = {
  unknown: 0,
  library: 1,
  addon: 2,
  webhost: 3,
  otherhost: 4,
  url: 5
};

/**
 * Takes the stack table and the frame table, creates a func stack table and
 * fixes up the funcStack field in the samples data.
 * @return object  The funcStackTable and the new samples object.
 */
export function getFuncStackInfo(stackTable, frameTable, funcTable, samples) {
return timeCode('getFuncStackInfo', () => {
  let stackIndexToFuncStackIndex = new Map();
  const funcCount = funcTable.length;
  let prefixFuncStackAndFuncToFuncStackMap = new Map(); // prefixFuncStack * funcCount + func => funcStack
  let funcStackTable = { length: 0, prefix: [], func: [], depth: [] };
  function addFuncStack(prefix, func) {
    const index = funcStackTable.length++;
    funcStackTable.prefix[index] = prefix;
    funcStackTable.func[index] = func;
    if (prefix === -1) {
      funcStackTable.depth[index] = 0;
    } else {
      funcStackTable.depth[index] = funcStackTable.depth[prefix] + 1;
    }
  }
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    const prefixFuncStack = (prefixStack === null) ? -1 :
       stackIndexToFuncStackIndex.get(prefixStack);
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const prefixFuncStackAndFuncIndex = prefixFuncStack * funcCount + funcIndex;
    let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(prefixFuncStackAndFuncIndex);
    if (funcStackIndex === undefined) {
      funcStackIndex = funcStackTable.length;
      addFuncStack(prefixFuncStack, funcIndex);
      prefixFuncStackAndFuncToFuncStackMap.set(prefixFuncStackAndFuncIndex, funcStackIndex);
    }
    stackIndexToFuncStackIndex.set(stackIndex, funcStackIndex);
  }
  funcStackTable.prefix = new Int32Array(funcStackTable.prefix);
  funcStackTable.func = new Int32Array(funcStackTable.func);
  funcStackTable.depth = funcStackTable.depth;

  return {
    funcStackTable,
    sampleFuncStacks: samples.stack.map(stack => stackIndexToFuncStackIndex.get(stack))
  };
});
}

function getTimeRangeForThread(thread, interval) {
  return { start: thread.samples.time[0], end: thread.samples.time[thread.samples.length - 1] + interval};
}

export function getTimeRangeIncludingAllThreads(profile) {
  const completeRange = { start: Infinity, end: -Infinity };
  profile.threads.forEach(thread => {
    const threadRange = getTimeRangeForThread(thread, profile.meta.interval);
    completeRange.start = Math.min(completeRange.start, threadRange.start);
    completeRange.end = Math.max(completeRange.end, threadRange.end);
  });
  return completeRange;
}

export function defaultThreadOrder(threads) {
  // Put the compositor thread last.
  let threadOrder = threads.map((thread, i) => i);
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;
    console.log(nameA, nameB);
    if (nameA === 'Compositor' && nameB !== 'Compositor')
      return 1;
    if (nameB === 'Compositor' && nameA !== 'Compositor')
      return -1;
    return a - b;
  });
  return threadOrder;
}

export function filterThreadToJSOnly(thread) {
return timeCode('filterThreadToJSOnly', () => {
  const { stackTable, funcTable, frameTable } = thread;

  // frameTable will be equal to funcTable
  const newFrameTable = {
    length: 0,
    func: [],
    address: [],
  };
  const newFuncTable = {
    length: 0,
    name: [],
    resource: [],
    address: [],
    isJS: [],
  };
  function addFrameAndFunc(oldFuncIndex) {
    const newFuncIndex = newFuncTable.length++;
    newFuncTable.name[newFuncIndex] = funcTable.name[oldFuncIndex];
    newFuncTable.resource[newFuncIndex] = funcTable.resource[oldFuncIndex];
    newFuncTable.isJS[newFuncIndex] = true;
    const newFrameIndex = newFrameTable.length++;
    newFrameTable.func[newFrameIndex] = newFuncIndex;
    return newFrameIndex;
  }
  const newStackTable = {
    length: 0,
    frame: [],
    prefix: [],
  };

  const oldStackToNewStack = new Map();
  const funcCount = funcTable.length;
  let prefixStackAndFuncToStack = new Map(); // prefixNewStack * funcCount + func => newStackIndex

  function convertStack(stackIndex) {
    if (stackIndex === null) {
      return null;
    }
    let newStack = oldStackToNewStack.get(stackIndex);
    if (newStack === undefined) {
      const prefixNewStack = convertStack(stackTable.prefix[stackIndex]);
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      if (!funcTable.isJS[funcIndex]) {
        newStack = prefixNewStack;
      } else {
        const prefixStackAndFuncIndex = (prefixNewStack === null ? -1 : prefixNewStack) * funcCount + funcIndex;
        newStack = prefixStackAndFuncToStack.get(prefixStackAndFuncIndex);
        if (newStack === undefined) {
          const newFrameIndex = addFrameAndFunc(funcIndex);
          newStack = newStackTable.length++;
          newStackTable.prefix[newStack] = prefixNewStack;
          newStackTable.frame[newStack] = newFrameIndex;
        }
        oldStackToNewStack.set(stackIndex, newStack);
        prefixStackAndFuncToStack.set(prefixStackAndFuncIndex, newStack);
      }
    }
    return newStack;
  }

  const newSamples = Object.assign({}, thread.samples, {
    stack: thread.samples.stack.map(oldStack => convertStack(oldStack))
  });

  return Object.assign({}, thread, {
    samples: newSamples,
    stackTable: newStackTable,
    funcTable: newFuncTable,
    frameTable: newFrameTable,
  });
});
}
