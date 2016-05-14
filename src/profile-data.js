import { timeCode } from './time-code';

/**
 * Various helpers for dealing with the profile as a data structure.
 * @module profile-data
 */

export const resourceTypes = {
  unknown: 0,
  library: 1,
  addon: 2,
  webhost: 3,
  otherhost: 4,
  url: 5,
};

/**
 * Takes the stack table and the frame table, creates a func stack table and
 * fixes up the funcStack field in the samples data.
 * @param  {Object} stackTable The thread's stackTable.
 * @param  {Object} frameTable The thread's frameTable.
 * @param  {Object} funcTable  The thread's funcTable.
 * @param  {Object} samples    The thread's samples.
 * @return {Object} The        funcStackTable and the new samples object.
 */
export function getFuncStackInfo(stackTable, frameTable, funcTable, samples) {
  return timeCode('getFuncStackInfo', () => {
    const stackIndexToFuncStackIndex = new Map();
    const funcCount = funcTable.length;
    const prefixFuncStackAndFuncToFuncStackMap = new Map(); // prefixFuncStack * funcCount + func => funcStack
    const funcStackTable = { length: 0, prefix: [], func: [], depth: [] };
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
      sampleFuncStacks: samples.stack.map(stack => stackIndexToFuncStackIndex.get(stack)),
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
  const threadOrder = threads.map((thread, i) => i);
  threadOrder.sort((a, b) => {
    const nameA = threads[a].name;
    const nameB = threads[b].name;
    if (nameA === nameB) {
      return a - b;
    }
    return (nameA === 'Compositor') ? 1 : -1;
  });
  return threadOrder;
}

export function filterThreadToJSOnly(thread) {
  return timeCode('filterThreadToJSOnly', () => {
    const { stackTable, funcTable, frameTable, samples } = thread;

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
    const prefixStackAndFuncToStack = new Map(); // prefixNewStack * funcCount + func => newStackIndex

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

    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => convertStack(oldStack)),
    });

    return Object.assign({}, thread, {
      samples: newSamples,
      stackTable: newStackTable,
      funcTable: newFuncTable,
      frameTable: newFrameTable,
    });
  });
}

export function getFuncStackFromFuncArray(funcArray, funcStackTable) {
  let fs = -1;
  for (let i = 0; i < funcArray.length; i++) {
    const func = funcArray[i];
    let nextFS = -1;
    for (let funcStackIndex = fs + 1; funcStackIndex < funcStackTable.length; funcStackIndex++) {
      if (funcStackTable.prefix[funcStackIndex] === fs &&
          funcStackTable.func[funcStackIndex] === func) {
        nextFS = funcStackIndex;
        break;
      }
    }
    if (nextFS === -1) {
      return null;
    }
    fs = nextFS;
  }
  return fs;
}

export function getStackAsFuncArray(funcStackIndex, funcStackTable) {
  if (funcStackIndex === null) {
    return [];
  }
  const funcArray = [];
  let fs = funcStackIndex;
  while (fs !== -1) {
    funcArray.push(funcStackTable.func[fs]);
    fs = funcStackTable.prefix[fs];
  }
  funcArray.reverse();
  return funcArray;
}

export function invertCallstack(thread) {
  return timeCode('invertCallstack', () => {
    const { stackTable, frameTable, samples } = thread;

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
    };
    const frameCount = frameTable.length;
    const prefixAndFrameToStack = new Map(); // prefix * frameCount + frame => stackIndex
    function stackFor(prefix, frame) {
      const prefixAndFrameIndex = (prefix === null ? -1 : prefix) * frameCount + frame;
      let stackIndex = prefixAndFrameToStack.get(prefixAndFrameIndex);
      if (stackIndex === undefined) {
        stackIndex = newStackTable.length++;
        newStackTable.prefix[stackIndex] = prefix;
        newStackTable.frame[stackIndex] = frame;
        prefixAndFrameToStack.set(prefixAndFrameIndex, stackIndex);
      }
      return stackIndex;
    }

    const oldStackToNewStack = new Map();

    function convertStack(stackIndex) {
      if (stackIndex === null) {
        return null;
      }
      let newStack = oldStackToNewStack.get(stackIndex);
      if (newStack === undefined) {
        newStack = null;
        for (let currentStack = stackIndex; currentStack !== null; currentStack = stackTable.prefix[currentStack]) {
          newStack = stackFor(newStack, stackTable.frame[currentStack]);
        }
        oldStackToNewStack.set(stackIndex, newStack);
      }
      return newStack;
    }

    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => convertStack(oldStack)),
    });

    return Object.assign({}, thread, {
      samples: newSamples,
      stackTable: newStackTable,
    });
  });
}
