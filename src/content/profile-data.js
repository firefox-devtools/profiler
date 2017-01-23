import { timeCode } from '../common/time-code';

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
  if (thread.samples.length === 0) {
    return { start: Infinity, end: -Infinity };
  }
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

/**
 * Filter thread to only contain stacks which start with |prefixFuncs|, and
 * only samples witth those stacks. The new stacks' roots will be frames whose
 * func is the last element of the prefix func array.
 * @param  {object} thread      The thread.
 * @param  {array} prefixFuncs  The prefix stack, as an array of funcs.
 * @param  {bool} matchJSOnly   Ignore non-JS frames during matching.
 * @return {object}             The filtered thread.
 */
export function filterThreadToPrefixStack(thread, prefixFuncs, matchJSOnly) {
  return timeCode('filterThreadToPrefixStack', () => {
    const { stackTable, frameTable, funcTable, samples } = thread;
    const prefixDepth = prefixFuncs.length;
    const stackMatches = new Int32Array(stackTable.length);
    const oldStackToNewStack = new Map();
    oldStackToNewStack.set(null, null);
    const newStackTable = {
      length: 0,
      prefix: [],
      frame: [],
    };
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const prefixMatchesUpTo = prefix !== null ? stackMatches[prefix] : 0;
      let stackMatchesUpTo = -1;
      if (prefixMatchesUpTo !== -1) {
        const frame = stackTable.frame[stackIndex];
        if (prefixMatchesUpTo === prefixDepth) {
          stackMatchesUpTo = prefixDepth;
        } else {
          const func = frameTable.func[frame];
          if (func === prefixFuncs[prefixMatchesUpTo]) {
            stackMatchesUpTo = prefixMatchesUpTo + 1;
          } else if (matchJSOnly && !funcTable.isJS[func]) {
            stackMatchesUpTo = prefixMatchesUpTo;
          }
        }
        if (stackMatchesUpTo === prefixDepth) {
          const newStackIndex = newStackTable.length++;
          const newStackPrefix = oldStackToNewStack.get(prefix);
          newStackTable.prefix[newStackIndex] = newStackPrefix !== undefined ? newStackPrefix : null;
          newStackTable.frame[newStackIndex] = frame;
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
      }
      stackMatches[stackIndex] = stackMatchesUpTo;
    }
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => {
        if (stackMatches[oldStack] !== prefixDepth) {
          return null;
        }
        return oldStackToNewStack.get(oldStack);
      }),
    });
    return Object.assign({}, thread, {
      stackTable: newStackTable,
      samples: newSamples,
    });
  });
}

/**
 * Filter thread to only contain stacks which end with |postfixFuncs|, and
 * only samples witth those stacks. The new stacks' leaf frames will be
 * frames whose func is the last element of the postfix func array.
 * @param  {object} thread      The thread.
 * @param  {array} postfixFuncs The postfix stack, as an array of funcs,
 *                              starting from the leaf func.
 * @param  {bool} matchJSOnly   Ignore non-JS frames during matching.
 * @return {object}             The filtered thread.
 */
export function filterThreadToPostfixStack(thread, postfixFuncs, matchJSOnly) {
  return timeCode('filterThreadToPostfixStack', () => {
    const postfixDepth = postfixFuncs.length;
    const { stackTable, frameTable, funcTable, samples } = thread;

    function convertStack(leaf) {
      let matchesUpToDepth = 0; // counted from the leaf
      for (let stack = leaf; stack !== null; stack = stackTable.prefix[stack]) {
        const frame = stackTable.frame[stack];
        const func = frameTable.func[frame];
        if (func === postfixFuncs[matchesUpToDepth]) {
          matchesUpToDepth++;
          if (matchesUpToDepth === postfixDepth) {
            return stack;
          }
        } else if (!matchJSOnly || funcTable.isJS[func]) {
          return null;
        }
      }
      return null;
    }

    const oldStackToNewStack = new Map();
    oldStackToNewStack.set(null, null);
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(stackIndex => {
        let newStackIndex = oldStackToNewStack.get(stackIndex);
        if (newStackIndex === undefined) {
          newStackIndex = convertStack(stackIndex);
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
        return newStackIndex;
      }),
    });
    return Object.assign({}, thread, {
      samples: newSamples,
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

function getMarkerIndexRangeForSelection(markers, rangeStart, rangeEnd) {
  // TODO: This should really use bisect. samples.time is sorted.
  const firstMarker = markers.time.findIndex(t => t >= rangeStart);
  if (firstMarker === -1) {
    return [markers.length, markers.length];
  }
  const afterLastSample = markers.time.slice(firstMarker).findIndex(t => t >= rangeEnd);
  if (afterLastSample === -1) {
    return [firstMarker, markers.length];
  }
  return [firstMarker, firstMarker + afterLastSample];
}

export function filterThreadToRange(thread, rangeStart, rangeEnd) {
  const { samples, markers } = thread;
  const [sBegin, sEnd] = getSampleIndexRangeForSelection(samples, rangeStart, rangeEnd);
  const newSamples = {
    length: sEnd - sBegin,
    time: samples.time.slice(sBegin, sEnd),
    stack: samples.stack.slice(sBegin, sEnd),
    responsiveness: samples.responsiveness.slice(sBegin, sEnd),
    rss: samples.rss.slice(sBegin, sEnd),
    uss: samples.uss.slice(sBegin, sEnd),
    frameNumber: samples.frameNumber.slice(sBegin, sEnd),
  };
  const [mBegin, mEnd] = getMarkerIndexRangeForSelection(markers, rangeStart, rangeEnd);
  const newMarkers = {
    length: mEnd - mBegin,
    time: markers.time.slice(mBegin, mEnd),
    name: markers.name.slice(mBegin, mEnd),
    data: markers.data.slice(mBegin, mEnd),
  };
  return Object.assign({}, thread, {
    samples: newSamples,
    markers: newMarkers,
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

export function getJankInstances(samples, processType, thresholdInMs) {
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
          title: `${lastResponsiveness.toFixed(2)}ms event processing delay on ${processType} thread`,
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
      title: `${lastResponsiveness.toFixed(2)}ms event processing delay on ${processType} thread`,
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
