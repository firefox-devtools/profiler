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
 * returns a map from each stack to its corresponding func stack which can be
 * used to provide funcStack information for the samples data.
 * @param  {Object} stackTable The thread's stackTable.
 * @param  {Object} frameTable The thread's frameTable.
 * @param  {Object} funcTable  The thread's funcTable.
 * @return {Object}            The funcStackTable and the stackIndexToFuncStackIndex map.
 */
export function getFuncStackInfo(stackTable, frameTable, funcTable) {
  return timeCode('getFuncStackInfo', () => {
    const stackIndexToFuncStackIndex = new Uint32Array(stackTable.length);
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
      // assert(prefixStack === null || prefixStack < stackIndex);
      const prefixFuncStack = (prefixStack === null) ? -1 :
         stackIndexToFuncStackIndex[prefixStack];
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      const prefixFuncStackAndFuncIndex = prefixFuncStack * funcCount + funcIndex;
      let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(prefixFuncStackAndFuncIndex);
      if (funcStackIndex === undefined) {
        funcStackIndex = funcStackTable.length;
        addFuncStack(prefixFuncStack, funcIndex);
        prefixFuncStackAndFuncToFuncStackMap.set(prefixFuncStackAndFuncIndex, funcStackIndex);
      }
      stackIndexToFuncStackIndex[stackIndex] = funcStackIndex;
    }
    funcStackTable.prefix = new Int32Array(funcStackTable.prefix);
    funcStackTable.func = new Int32Array(funcStackTable.func);
    funcStackTable.depth = funcStackTable.depth;

    return {
      funcStackTable,
      stackIndexToFuncStackIndex,
    };
  });
}

export function getSampleFuncStacks(samples, stackIndexToFuncStackIndex) {
  return samples.stack.map(stack => stackIndexToFuncStackIndex[stack]);
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

    const newStackTable = {
      length: 0,
      frame: [],
      prefix: [],
    };

    const oldStackToNewStack = new Map();
    const frameCount = frameTable.length;
    const prefixStackAndFrameToStack = new Map(); // prefixNewStack * frameCount + frame => newStackIndex

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
          const prefixStackAndFrameIndex = (prefixNewStack === null ? -1 : prefixNewStack) * frameCount + frameIndex;
          newStack = prefixStackAndFrameToStack.get(prefixStackAndFrameIndex);
          if (newStack === undefined) {
            newStack = newStackTable.length++;
            newStackTable.prefix[newStack] = prefixNewStack;
            newStackTable.frame[newStack] = frameIndex;
          }
          oldStackToNewStack.set(stackIndex, newStack);
          prefixStackAndFrameToStack.set(prefixStackAndFrameIndex, newStack);
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
    });
  });
}

export function filterThreadToSearchString(thread, searchString) {
  return timeCode('filterThreadToSearchString', () => {
    if (searchString === '') {
      return thread;
    }
    const lowercaseSearchString = searchString.toLowerCase();
    const { samples, funcTable, frameTable, stackTable, stringTable } = thread;

    const funcMatchesFilterCache = new Map();
    function funcMatchesFilter(func) {
      let result = funcMatchesFilterCache.get(func);
      if (result === undefined) {
        const nameIndex = funcTable.name[func];
        const nameString = stringTable.getString(nameIndex);
        result = nameString.toLowerCase().includes(lowercaseSearchString);
        funcMatchesFilterCache.set(func, result);
      }
      return result;
    }

    const stackMatchesFilterCache = new Map();
    function stackMatchesFilter(stackIndex) {
      if (stackIndex === null) {
        return false;
      }
      let result = stackMatchesFilterCache.get(stackIndex);
      if (result === undefined) {
        const prefix = stackTable.prefix[stackIndex];
        if (stackMatchesFilter(prefix)) {
          result = true;
        } else {
          const frame = stackTable.frame[stackIndex];
          const func = frameTable.func[frame];
          result = funcMatchesFilter(func);
        }
        stackMatchesFilterCache.set(stackIndex, result);
      }
      return result;
    }

    return Object.assign({}, thread, {
      samples: Object.assign({}, samples, {
        stack: samples.stack.map(s => stackMatchesFilter(s) ? s : null),
      }),
    });
  });
}

function getSampleIndexRangeForSelection(samples, rangeStart, rangeEnd) {
  // TODO: This should really use bisect. samples.time is sorted.
  const firstSample = samples.time.findIndex(t => t >= rangeStart);
  if (firstSample === -1) {
    return [samples.length, samples.length];
  }
  const afterLastSample = samples.time.slice(firstSample).findIndex(t => t >= rangeEnd);
  if (afterLastSample === -1) {
    return [firstSample, samples.length];
  }
  return [firstSample, firstSample + afterLastSample];
}

export function filterThreadToRange(thread, rangeStart, rangeEnd) {
  const { samples } = thread;
  const [begin, end] = getSampleIndexRangeForSelection(samples, rangeStart, rangeEnd);
  const newSamples = {
    length: end - begin,
    time: samples.time.slice(begin, end),
    stack: samples.stack.slice(begin, end),
    responsiveness: samples.responsiveness.slice(begin, end),
    rss: samples.rss.slice(begin, end),
    uss: samples.uss.slice(begin, end),
    frameNumber: samples.frameNumber.slice(begin, end),
    power: samples.power.slice(begin, end),
  };
  return Object.assign({}, thread, { samples: newSamples });
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
  if (funcStackIndex * 1 !== funcStackIndex) {
    console.log('bad funcStackIndex in getStackAsFuncArray:', funcStackIndex);
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

export function getSampleIndexClosestToTime(samples, time) {
  // TODO: This should really use bisect. samples.time is sorted.
  for (let i = 0; i < samples.length; i++) {
    if (samples.time[i] >= time) {
      if (i === 0) {
        return 0;
      }
      const distanceToThis = samples.time[i] - time;
      const distanceToLast = time - samples.time[i - 1];
      return distanceToThis < distanceToLast ? i : i - 1;
    }
  }
  return samples.length - 1;
}

export function getJankInstances(samples, threadName, thresholdInMs) {
  let lastResponsiveness = 0;
  let lastTimestamp = 0;
  const jankInstances = [];
  for (let i = 0; i < samples.length; i++) {
    const currentResponsiveness = samples.responsiveness[i];
    if (currentResponsiveness < lastResponsiveness) {
      if (lastResponsiveness >= thresholdInMs) {
        jankInstances.push({
          start: lastTimestamp - lastResponsiveness,
          dur: lastResponsiveness,
          title: `${lastResponsiveness.toFixed(2)}ms event processing delay on thread ${threadName}`,
          name: 'Jank',
        });
      }
    }
    lastResponsiveness = currentResponsiveness;
    lastTimestamp = samples.time[i];
  }
  if (lastResponsiveness >= thresholdInMs) {
    jankInstances.push({
      start: lastTimestamp - lastResponsiveness,
      dur: lastResponsiveness,
      title: `${lastResponsiveness.toFixed(2)}ms event processing delay on thread ${threadName}`,
      name: 'Jank',
    });
  }
  return jankInstances;
}

export function getTracingMarkers(thread, markers) {
  const tracingMarkers = [];
  const { stringTable } = thread;
  const openMarkers = [];
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (!data || data.type !== 'tracing') {
      // console.log('non-tracing marker:', name);
      continue;
    }

    const time = markers.time[i];
    const name = stringTable.getString(markers.name[i]);
    if (data.interval === 'start') {
      openMarkers.push({
        start: time,
        name,
      });
    } else if (data.interval === 'end') {
      const marker = openMarkers.pop();
      if (marker === undefined) {
        continue;
      }
      marker.dur = time - marker.start;
      marker.title = `${marker.name} for ${marker.dur.toFixed(2)}ms`;
      tracingMarkers.push(marker);
    }
  }
  return tracingMarkers;
}
