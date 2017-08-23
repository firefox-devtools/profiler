/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  uintArrayToString,
  stringToUintArray,
} from '../utils/uintarray-encoding';
import { toValidImplementationFilter } from './profile-data';
import { timeCode } from '../utils/time-code';

import type {
  Thread,
  IndexIntoFuncTable,
  IndexIntoStackTable,
} from '../types/profile';
import type { CallNodePath } from '../types/profile-derived';
import type { ImplementationFilter } from '../types/actions';
import type { Transform, TransformStack } from '../types/transforms';

/**
 * This file contains the functions and logic for working with and applying transforms
 * to profile data.
 */

/**
 * Map each transform key into a short representation.
 */
const TRANSFORM_TO_SHORT_KEY = {
  'focus-subtree': 'f',
  'merge-subtree': 'ms',
  'merge-call-node': 'mcn',
};

const SHORT_KEY_TO_TRANSFORM = {
  f: 'focus-subtree',
  ms: 'merge-subtree',
  mcn: 'merge-call-node',
};

/**
 * Every transform is separated by the "~" character.
 * Each transform is made up of a tuple separated by "-"
 * The first value in the tuple is a short key of the transform type.
 *
 * e.g "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
 */
export function parseTransforms(stringValue: string = '') {
  return stringValue
    .split('~')
    .map(s => {
      const tuple = s.split('-');
      const shortKey = tuple[0];
      const type = SHORT_KEY_TO_TRANSFORM[shortKey];

      if (!type) {
        console.error('Unrecognized transform was passed to the URL.');
        return undefined;
      }

      // e.g. "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
      const [, implementation, serializedCallNodePath, inverted] = tuple;
      const transform = {
        type,
        implementation: toValidImplementationFilter(implementation),
        callNodePath: stringToUintArray(serializedCallNodePath),
        inverted: Boolean(inverted),
      };
      return transform;
    })
    .filter(f => f);
}

export function stringifyTransforms(transforms: TransformStack = []): string {
  return transforms
    .map(transform => {
      let string = [
        TRANSFORM_TO_SHORT_KEY[transform.type],
        transform.implementation,
        uintArrayToString(transform.callNodePath),
      ].join('-');
      if (transform.inverted) {
        string += '-i';
      }
      return string;
    })
    .join('~');
}

export function getTransformLabels(
  thread: Thread,
  threadName: string,
  transforms: Transform[]
) {
  const { funcTable, stringTable } = thread;
  const labels = transforms.map(transform => {
    function lastFuncString(callNodePath) {
      const lastFunc = callNodePath[callNodePath.length - 1];
      const nameIndex = funcTable.name[lastFunc];
      return stringTable.getString(nameIndex);
    }

    const funcName = lastFuncString(transform.callNodePath);

    switch (transform.type) {
      case 'focus-subtree':
        return `Focus: ${funcName}`;
      case 'merge-subtree':
        return `Merge Subtree: ${funcName}`;
      case 'merge-call-node':
        return `Merge: ${funcName}`;
      default:
        throw new Error('Unexpected transform type');
    }
  });
  labels.unshift(`Complete "${threadName}"`);
  return labels;
}

export function applyTransformToCallNodePath(
  callNodePath: CallNodePath,
  transform: Transform
): CallNodePath {
  switch (transform.type) {
    case 'focus-subtree':
      return _removePrefixPathFromCallNodePath(
        transform.callNodePath,
        callNodePath
      );
    case 'merge-call-node':
      return _mergeNodeInCallNodePath(transform.callNodePath, callNodePath);
    default:
      throw new Error(
        'Cannot apply an unknown transform to update the CallNodePath'
      );
  }
}

function _removePrefixPathFromCallNodePath(
  prefixPath: CallNodePath,
  callNodePath: CallNodePath
): CallNodePath {
  return _callNodePathHasPrefixPath(prefixPath, callNodePath)
    ? callNodePath.slice(prefixPath.length - 1)
    : [];
}

function _mergeNodeInCallNodePath(
  prefixPath: CallNodePath,
  callNodePath: CallNodePath
): CallNodePath {
  return _callNodePathHasPrefixPath(prefixPath, callNodePath)
    ? callNodePath.filter((_, i) => i !== prefixPath.length - 1)
    : callNodePath;
}

function _callNodePathHasPrefixPath(
  prefixPath: CallNodePath,
  callNodePath: CallNodePath
): boolean {
  return (
    prefixPath.length <= callNodePath.length &&
    prefixPath.every((prefixFunc, i) => prefixFunc === callNodePath[i])
  );
}

export function pathsAreEqual(a: CallNodePath, b: CallNodePath): boolean {
  return a.length === b.length && a.every((func, i) => func === b[i]);
}

/**
 * Transform a thread's stacks to merge stacks that match the CallNodePath into
 * the calling stack. See `src/types/transforms.js` for more information about the
 * "merge-call-node" transform.
 */
export function mergeCallNode(
  thread: Thread,
  callNodePath: CallNodePath,
  implementation: ImplementationFilter
): Thread {
  return timeCode('mergeCallNode', () => {
    const { stackTable, frameTable, samples } = thread;
    // Depth here is 0 indexed.
    const depthAtCallNodePathLeaf = callNodePath.length - 1;
    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
    oldStackToNewStack.set(null, null);
    const newStackTable = {
      length: 0,
      prefix: [],
      frame: [],
    };
    // Provide two arrays to efficiently cache values for the algorithm. This probably
    // could be refactored to use only one array here.
    const stackDepths = [];
    const stackMatches = [];
    const funcMatchesImplementation = FUNC_MATCHES[implementation];
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];

      const doesPrefixMatch = prefix === null ? true : stackMatches[prefix];
      const prefixDepth = prefix === null ? -1 : stackDepths[prefix];
      const currentFuncOnPath = callNodePath[prefixDepth + 1];

      let doMerge = false;
      let stackDepth = prefixDepth;
      let doesMatchCallNodePath;
      if (doesPrefixMatch && stackDepth < depthAtCallNodePathLeaf) {
        // This stack's prefixes were in our CallNodePath.
        if (currentFuncOnPath === funcIndex) {
          // This stack's function matches too!
          doesMatchCallNodePath = true;
          if (stackDepth + 1 === depthAtCallNodePathLeaf) {
            // Holy cow, we found a match for our merge operation and can merge this stack.
            doMerge = true;
          } else {
            // Since we found a match, increase the stack depth. This should match
            // the depth of the implementation filtered stacks.
            stackDepth++;
          }
        } else if (!funcMatchesImplementation(thread, funcIndex)) {
          // This stack's function does not match the CallNodePath, however it's not part
          // of the CallNodePath's implementation filter. Go ahead and keep it.
          doesMatchCallNodePath = true;
        } else {
          // While all of the predecessors matched, this stack's function does not :(
          doesMatchCallNodePath = false;
        }
      } else {
        // This stack is not part of a matching branch of the tree.
        doesMatchCallNodePath = false;
      }
      stackMatches[stackIndex] = doesMatchCallNodePath;
      stackDepths[stackIndex] = stackDepth;

      // Map the oldStackToNewStack, and only push on the stacks that aren't merged.
      if (doMerge) {
        const newStackPrefix = oldStackToNewStack.get(prefix);
        oldStackToNewStack.set(
          stackIndex,
          newStackPrefix === undefined ? null : newStackPrefix
        );
      } else {
        const newStackIndex = newStackTable.length++;
        const newStackPrefix = oldStackToNewStack.get(prefix);
        newStackTable.prefix[newStackIndex] =
          newStackPrefix === undefined ? null : newStackPrefix;
        newStackTable.frame[newStackIndex] = frameIndex;
        oldStackToNewStack.set(stackIndex, newStackIndex);
      }
    }
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => {
        const newStack = oldStackToNewStack.get(oldStack);
        if (newStack === undefined) {
          throw new Error(
            'Converting from the old stack to a new stack cannot be undefined'
          );
        }
        return newStack;
      }),
    });
    return Object.assign({}, thread, {
      stackTable: newStackTable,
      samples: newSamples,
    });
  });
}

/**
 * Transform a thread to merge stacks that match the `postfixCallNodePath` into
 * the caller. See `src/types/transforms.js` for more information about the
 * "merge-call-node" transform.
 */
export function mergeInvertedCallNode(
  thread: Thread,
  postfixCallNodePath: CallNodePath,
  implementation: ImplementationFilter
): Thread {
  return timeCode('mergeCallNode', () => {
    const { stackTable, frameTable, samples } = thread;
    const postfixDepth = postfixCallNodePath.length;
    const funcMatchesImplementation = FUNC_MATCHES[implementation];

    const stackNeedsMerging: Array<void | true> = [];
    const stacksChecked: Array<void | true> = [];

    // Go through each sample and determine if it contains a stack that needs to be
    // merged.
    for (let i = 0; i < samples.stack.length; i++) {
      const leafStackIndex = samples.stack[i];
      if (leafStackIndex === null || stacksChecked[leafStackIndex]) {
        continue;
      }
      stacksChecked[leafStackIndex] = true;

      let matchesUpToDepth = 0; // counted from the leaf
      for (
        let stackIndex = leafStackIndex;
        stackIndex !== null;
        stackIndex = stackTable.prefix[stackIndex]
      ) {
        const frameIndex = stackTable.frame[stackIndex];
        const funcIndex = frameTable.func[frameIndex];

        if (funcIndex === postfixCallNodePath[matchesUpToDepth]) {
          // The CallNodePath matches up to this depth.
          matchesUpToDepth++;
          if (matchesUpToDepth === postfixDepth) {
            // This matches the CallNodePath.
            stackNeedsMerging[stackIndex] = true;
            break;
          }
        } else if (funcMatchesImplementation(thread, funcIndex)) {
          // This function didn't match the CallNodePath, and it can't be ignored
          // because it matches the implementation.
          break;
        }
      }
    }

    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
    oldStackToNewStack.set(null, null);
    const newStackTable = {
      length: 0,
      prefix: [],
      frame: [],
    };

    // We have determined which stacks need to be merged, now do the merging in
    // one pass across all the stacks.
    for (
      let oldStackIndex = 0;
      oldStackIndex < stackTable.length;
      oldStackIndex++
    ) {
      const oldPrefix = stackTable.prefix[oldStackIndex];
      const newPrefix = oldStackToNewStack.get(oldPrefix);
      if (newPrefix === undefined) {
        throw new Error('The stack must not have an undefined prefix.');
      }
      // Skip over this stack, since we are merging it.
      if (stackNeedsMerging[oldStackIndex]) {
        oldStackToNewStack.set(oldStackIndex, newPrefix);
        continue;
      }

      const newStackIndex = newStackTable.length++;
      newStackTable.prefix.push(newPrefix);
      newStackTable.frame.push(stackTable.frame[oldStackIndex]);
      oldStackToNewStack.set(oldStackIndex, newStackIndex);
    }

    const newSamplesTable = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => {
        const newStack = oldStackToNewStack.get(oldStack);
        if (newStack === undefined) {
          throw new Error('The stack must not convert to undefined.');
        }
        return newStack;
      }),
    });

    return Object.assign({}, thread, {
      stackTable: newStackTable,
      samples: newSamplesTable,
    });
  });
}

const FUNC_MATCHES = {
  combined: (_thread: Thread, _funcIndex: IndexIntoFuncTable) => true,
  cpp: (thread: Thread, funcIndex: IndexIntoFuncTable): boolean => {
    const { funcTable, stringTable } = thread;
    // Return quickly if this is a JS frame.
    if (thread.funcTable.isJS[funcIndex]) {
      return false;
    }

    // Regular C++ functions are associated with a resource that describes the
    // shared library that these C++ functions were loaded from. Jitcode is not
    // loaded from shared libraries but instead generated at runtime, so Jitcode
    // frames are not associated with a shared library and thus have no resource
    const locationString = stringTable.getString(funcTable.name[funcIndex]);
    const isProbablyJitCode =
      funcTable.resource[funcIndex] === -1 && locationString.startsWith('0x');
    return !isProbablyJitCode;
  },
  js: (thread: Thread, funcIndex: IndexIntoFuncTable): boolean => {
    return thread.funcTable.isJS[funcIndex];
  },
};

/**
 * Filter thread to only contain stacks which start with a CallNodePath, and
 * only samples with those stacks. The new stacks' roots will be frames whose
 * func is the last element of the prefix CallNodePath.
 */
export function focusSubtree(
  thread: Thread,
  callNodePath: CallNodePath,
  implementation: ImplementationFilter
): Thread {
  return timeCode('focusSubtree', () => {
    const { stackTable, frameTable, samples } = thread;
    const prefixDepth = callNodePath.length;
    const stackMatches = new Int32Array(stackTable.length);
    // TODO - Handle any implementation here.
    const funcMatchesImplementation = FUNC_MATCHES[implementation];
    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
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
          const funcIndex = frameTable.func[frame];
          if (funcIndex === callNodePath[prefixMatchesUpTo]) {
            stackMatchesUpTo = prefixMatchesUpTo + 1;
          } else if (!funcMatchesImplementation(thread, funcIndex)) {
            stackMatchesUpTo = prefixMatchesUpTo;
          }
        }
        if (stackMatchesUpTo === prefixDepth) {
          const newStackIndex = newStackTable.length++;
          const newStackPrefix = oldStackToNewStack.get(prefix);
          newStackTable.prefix[newStackIndex] =
            newStackPrefix !== undefined ? newStackPrefix : null;
          newStackTable.frame[newStackIndex] = frame;
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
      }
      stackMatches[stackIndex] = stackMatchesUpTo;
    }
    const newSamples = Object.assign({}, samples, {
      stack: samples.stack.map(oldStack => {
        if (oldStack === null || stackMatches[oldStack] !== prefixDepth) {
          return null;
        }
        const newStack = oldStackToNewStack.get(oldStack);
        if (newStack === undefined) {
          throw new Error(
            'Converting from the old stack to a new stack cannot be undefined'
          );
        }
        return newStack;
      }),
    });
    return Object.assign({}, thread, {
      stackTable: newStackTable,
      samples: newSamples,
    });
  });
}

/**
 * Filter thread to only contain stacks which end with a CallNodePath, and
 * only samples with those stacks. The new stacks' leaf frames will be
 * frames whose func is the last element of the postfix func array.
 */
export function focusInvertedSubtree(
  thread: Thread,
  postfixCallNodePath: CallNodePath,
  implementation: ImplementationFilter
): Thread {
  return timeCode('focusInvertedSubtree', () => {
    const postfixDepth = postfixCallNodePath.length;
    const { stackTable, frameTable, samples } = thread;
    // TODO - Match any implementation.
    const funcMatchesImplementation = FUNC_MATCHES[implementation];
    function convertStack(leaf) {
      let matchesUpToDepth = 0; // counted from the leaf
      for (let stack = leaf; stack !== null; stack = stackTable.prefix[stack]) {
        const frame = stackTable.frame[stack];
        const funcIndex = frameTable.func[frame];
        if (funcIndex === postfixCallNodePath[matchesUpToDepth]) {
          matchesUpToDepth++;
          if (matchesUpToDepth === postfixDepth) {
            return stack;
          }
        } else if (funcMatchesImplementation(thread, funcIndex)) {
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
