/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  encodeUintArrayForUrlComponent,
  decodeUintArrayFromUrlComponent,
} from '../utils/uintarray-encoding';
import {
  toValidImplementationFilter,
  updateThreadStacks,
  updateThreadStacksByGeneratingNewStackColumns,
  getMapStackUpdater,
  getOriginAnnotationForFunc,
} from './profile-data';
import { timeCode } from '../utils/time-code';
import { assertExhaustiveCheck, convertToTransformType } from '../utils/flow';
import { canonicalizeRangeSet } from '../utils/range-set';
import {
  getSearchFilteredMarkerIndexes,
  stringsToMarkerRegExps,
} from '../profile-logic/marker-data';
import { shallowCloneFrameTable, getEmptyStackTable } from './data-structures';
import { getFunctionName } from './function-info';
import { splitSearchString } from '../utils/string';

import type {
  Thread,
  FuncTable,
  IndexIntoCategoryList,
  IndexIntoFuncTable,
  IndexIntoStackTable,
  IndexIntoResourceTable,
  CallNodePath,
  CallNodeTable,
  StackType,
  ImplementationFilter,
  Transform,
  TransformType,
  TransformStack,
  ProfileMeta,
  StartEndRange,
  FilterSamplesType,
  Marker,
  MarkerIndex,
  MarkerSchemaByName,
  CategoryList,
  Milliseconds,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';
import type { StringTable } from 'firefox-profiler/utils/string-table';

/**
 * This file contains the functions and logic for working with and applying transforms
 * to profile data.
 */

// Create mappings from a transform name, to a url-friendly short name.
const TRANSFORM_TO_SHORT_KEY: Partial<{ [TT in TransformType]: string }> = {};
const SHORT_KEY_TO_TRANSFORM: { [TT: string]: TransformType } = {};
[
  'focus-subtree',
  'focus-function',
  'focus-category',
  'merge-call-node',
  'merge-function',
  'drop-function',
  'collapse-resource',
  'collapse-direct-recursion',
  'collapse-recursion',
  'collapse-function-subtree',
  'filter-samples',
].forEach((transform: TransformType) => {
  // This is kind of an awkward switch, but it ensures we've exhaustively checked that
  // we have a mapping for every transform.
  let shortKey;
  switch (transform) {
    case 'focus-subtree':
      shortKey = 'f';
      break;
    case 'focus-function':
      shortKey = 'ff';
      break;
    case 'focus-category':
      shortKey = 'fg';
      break;
    case 'merge-call-node':
      shortKey = 'mcn';
      break;
    case 'merge-function':
      shortKey = 'mf';
      break;
    case 'drop-function':
      shortKey = 'df';
      break;
    case 'collapse-resource':
      shortKey = 'cr';
      break;
    case 'collapse-direct-recursion':
      shortKey = 'drec';
      break;
    case 'collapse-recursion':
      shortKey = 'rec';
      break;
    case 'collapse-function-subtree':
      shortKey = 'cfs';
      break;
    case 'filter-samples':
      shortKey = 'fs';
      break;
    default: {
      throw assertExhaustiveCheck(transform);
    }
  }
  TRANSFORM_TO_SHORT_KEY[transform] = shortKey;
  SHORT_KEY_TO_TRANSFORM[shortKey] = transform;
});

/**
 * Map each transform key into a short representation.
 */

/**
 * Parses the transform stack that is applied to the selected thread,
 * or to the set of selected threads.
 * Every transform is separated by the "~" character.
 * Each transform is made up of a tuple separated by "-"
 * The first value in the tuple is a short key of the transform type.
 *
 * e.g "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
 */
export function parseTransforms(transformString: string): TransformStack {
  if (!transformString) {
    return [];
  }
  const transforms = [];

  transformString.split('~').forEach((s) => {
    const tuple = s.split('-');
    const shortKey = tuple[0];
    const type = convertToTransformType(SHORT_KEY_TO_TRANSFORM[shortKey]);
    if (type === null) {
      console.error('Unrecognized transform was passed to the URL.', shortKey);
      return;
    }
    // This switch breaks down each transform into the minimum amount of data needed
    // to represent it in the URL. Each transform has slightly different requirements
    // as defined in src/types/transforms.js.
    switch (type) {
      case 'collapse-resource': {
        // e.g. "cr-js-325-8"
        const [, implementation, resourceIndexRaw, collapsedFuncIndexRaw] =
          tuple;
        const resourceIndex = parseInt(resourceIndexRaw, 10);
        const collapsedFuncIndex = parseInt(collapsedFuncIndexRaw, 10);
        if (isNaN(resourceIndex) || isNaN(collapsedFuncIndex)) {
          break;
        }
        if (resourceIndex >= 0) {
          transforms.push({
            type,
            resourceIndex,
            collapsedFuncIndex,
            implementation: toValidImplementationFilter(implementation),
          });
        }

        break;
      }
      case 'collapse-recursion': {
        // e.g. "rec-325"
        const [, funcIndexRaw] = tuple;
        const funcIndex = parseInt(funcIndexRaw, 10);
        if (isNaN(funcIndex) || funcIndex < 0) {
          break;
        }
        transforms.push({
          type: 'collapse-recursion',
          funcIndex,
        });
        break;
      }
      case 'collapse-direct-recursion': {
        // e.g. "drec-js-325"
        const [, implementation, funcIndexRaw] = tuple;
        const funcIndex = parseInt(funcIndexRaw, 10);
        if (isNaN(funcIndex) || funcIndex < 0) {
          break;
        }
        transforms.push({
          type: 'collapse-direct-recursion',
          funcIndex,
          implementation: toValidImplementationFilter(implementation),
        });
        break;
      }
      case 'merge-function':
      case 'focus-function':
      case 'drop-function':
      case 'collapse-function-subtree': {
        // e.g. "mf-325"
        const [, funcIndexRaw] = tuple;
        const funcIndex = parseInt(funcIndexRaw, 10);
        // Validate that the funcIndex makes sense.
        if (!isNaN(funcIndex) && funcIndex >= 0) {
          switch (type) {
            case 'merge-function':
              transforms.push({
                type: 'merge-function',
                funcIndex,
              });
              break;
            case 'focus-function':
              transforms.push({
                type: 'focus-function',
                funcIndex,
              });
              break;
            case 'drop-function':
              transforms.push({
                type: 'drop-function',
                funcIndex,
              });
              break;
            case 'collapse-function-subtree':
              transforms.push({
                type: 'collapse-function-subtree',
                funcIndex,
              });
              break;
            default:
              throw new Error('Unmatched transform.');
          }
        }
        break;
      }
      case 'focus-category': {
        // e.g. "fg-3"
        const [, categoryRaw] = tuple;
        const category = parseInt(categoryRaw, 10);
        // Validate that the category makes sense.
        if (!isNaN(category) && category >= 0) {
          transforms.push({
            type: 'focus-category',
            category,
          });
        }
        break;
      }
      case 'focus-subtree':
      case 'merge-call-node': {
        // e.g. "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
        const [, implementationRaw, serializedCallNodePath, invertedRaw] =
          tuple;
        const implementation = toValidImplementationFilter(implementationRaw);
        const callNodePath = decodeUintArrayFromUrlComponent(
          serializedCallNodePath
        );
        const inverted = Boolean(invertedRaw);
        // Flow requires a switch because it can't deduce the type string correctly.
        switch (type) {
          case 'focus-subtree':
            transforms.push({
              type: 'focus-subtree',
              implementation,
              callNodePath,
              inverted,
            });
            break;
          case 'merge-call-node':
            transforms.push({
              type: 'merge-call-node',
              implementation,
              callNodePath,
            });
            break;
          default:
            throw new Error('Unmatched transform.');
        }

        break;
      }
      case 'filter-samples': {
        // e.g. "fs-m-BackboneJS-TodoMVC.Adding100Items-async"
        const [, shortFilterType, ...filter] = tuple;
        // Filter string may include "-" characters, so we need to join them back.
        const filterString = filter.join('-');
        const filterType = convertToFullFilterType(shortFilterType);

        transforms.push({
          type: 'filter-samples',
          filterType,
          filter: filterString,
        });
        break;
      }
      default:
        throw assertExhaustiveCheck(type);
    }
  });
  return transforms;
}

/**
 * Convert the shortened filter type into the full filter type.
 */
function convertToFullFilterType(shortFilterType: string): FilterSamplesType {
  switch (shortFilterType) {
    case 'm':
      return 'marker-search';
    default:
      throw new Error('Unknown filter type.');
  }
}

/**
 * Convert the full filter type into the shortened filter type.
 */
function convertToShortFilterType(filterType: FilterSamplesType): string {
  switch (filterType) {
    case 'marker-search':
      return 'm';
    default:
      throw assertExhaustiveCheck(filterType);
  }
}

/**
 * Each transform in the stack is separated by a "~".
 */
export function stringifyTransforms(transformStack: TransformStack): string {
  return transformStack
    .map((transform) => {
      const shortKey = TRANSFORM_TO_SHORT_KEY[transform.type];
      if (!shortKey) {
        throw new Error(
          'Expected to be able to convert a transform into its short key.'
        );
      }
      // This switch breaks down each transform into shared groups of what data
      // they need, as defined in src/types/transforms.js. For instance some transforms
      // need only a funcIndex, while some care about the current implemention, or
      // other pieces of data.
      switch (transform.type) {
        case 'merge-function':
        case 'drop-function':
        case 'collapse-function-subtree':
        case 'focus-function':
          return `${shortKey}-${transform.funcIndex}`;
        case 'focus-category':
          return `${shortKey}-${transform.category}`;
        case 'collapse-resource':
          return `${shortKey}-${transform.implementation}-${transform.resourceIndex}-${transform.collapsedFuncIndex}`;
        case 'collapse-recursion':
          return `${shortKey}-${transform.funcIndex}`;
        case 'collapse-direct-recursion':
          return `${shortKey}-${transform.implementation}-${transform.funcIndex}`;
        case 'focus-subtree':
        case 'merge-call-node': {
          let string = [
            shortKey,
            transform.implementation,
            encodeUintArrayForUrlComponent(transform.callNodePath),
          ].join('-');
          if ('inverted' in transform && transform.inverted) {
            string += '-i';
          }
          return string;
        }
        case 'filter-samples':
          return `${shortKey}-${convertToShortFilterType(
            transform.filterType
          )}-${transform.filter}`;
        default:
          throw assertExhaustiveCheck(transform);
      }
    })
    .join('~');
}

export type TransformLabeL10nIds = {
  readonly l10nId: string;
  readonly item: string;
};

/**
 * Gets all applied transforms and returns their labels as l10n Ids with the
 * items associated to them. The `item`s can be a resource, function, or thread
 * name. They are being passed in the `Localized` component to create the
 * transform strings as desired.
 */
export function getTransformLabelL10nIds(
  meta: ProfileMeta,
  thread: Thread,
  threadName: string,
  transforms: Transform[]
): Array<TransformLabeL10nIds> {
  const { funcTable, stringTable, resourceTable } = thread;
  const { categories } = meta;
  const labels: TransformLabeL10nIds[] = transforms.map((transform) => {
    // Lookup library information.
    if (transform.type === 'collapse-resource') {
      const nameIndex = resourceTable.name[transform.resourceIndex];
      const resourceName = stringTable.getString(nameIndex);
      return {
        l10nId: 'TransformNavigator--collapse-resource',
        item: resourceName,
      };
    }

    if (transform.type === 'focus-category') {
      if (categories === undefined) {
        throw new Error('Expected categories to be defined.');
      }
      return {
        l10nId: 'TransformNavigator--focus-category',
        item: categories[transform.category].name,
      };
    }

    if (transform.type === 'filter-samples') {
      switch (transform.filterType) {
        case 'marker-search':
          return {
            l10nId:
              'TransformNavigator--drop-samples-outside-of-markers-matching',
            item: transform.filter,
          };
        default:
          throw assertExhaustiveCheck(transform.filterType);
      }
    }

    // Lookup function name.
    let funcIndex;
    switch (transform.type) {
      case 'focus-subtree':
      case 'merge-call-node':
        funcIndex = transform.callNodePath[transform.callNodePath.length - 1];
        break;
      case 'focus-function':
      case 'merge-function':
      case 'drop-function':
      case 'collapse-direct-recursion':
      case 'collapse-recursion':
      case 'collapse-function-subtree':
        funcIndex = transform.funcIndex;
        break;
      default:
        throw assertExhaustiveCheck(transform);
    }
    const nameIndex = funcTable.name[funcIndex];
    const funcName = getFunctionName(stringTable.getString(nameIndex));

    switch (transform.type) {
      case 'focus-subtree':
        return { l10nId: 'TransformNavigator--focus-subtree', item: funcName };
      case 'focus-function':
        return { l10nId: 'TransformNavigator--focus-function', item: funcName };
      case 'merge-call-node':
        return {
          l10nId: 'TransformNavigator--merge-call-node',
          item: funcName,
        };
      case 'merge-function':
        return { l10nId: 'TransformNavigator--merge-function', item: funcName };
      case 'drop-function':
        return { l10nId: 'TransformNavigator--drop-function', item: funcName };
      case 'collapse-direct-recursion':
        return {
          l10nId: 'TransformNavigator--collapse-direct-recursion-only',
          item: funcName,
        };
      case 'collapse-recursion':
        return {
          l10nId: 'TransformNavigator--collapse-recursion',
          item: funcName,
        };
      case 'collapse-function-subtree':
        return {
          l10nId: 'TransformNavigator--collapse-function-subtree',
          item: funcName,
        };
      default:
        throw assertExhaustiveCheck(transform);
    }
  });
  labels.unshift({
    l10nId: 'TransformNavigator--complete',
    item: threadName,
  });
  return labels;
}

export function applyTransformToCallNodePath(
  callNodePath: CallNodePath,
  transform: Transform,
  transformedThread: Thread,
  callNodeInfo: CallNodeInfo
): CallNodePath {
  switch (transform.type) {
    case 'focus-subtree':
      return _removePrefixPathFromCallNodePath(
        transform.callNodePath,
        callNodePath
      );
    case 'focus-function':
      return _startCallNodePathWithFunction(transform.funcIndex, callNodePath);
    case 'focus-category':
      return _removeOtherCategoryFunctionsInNodePathWithFunction(
        transform.category,
        callNodePath,
        callNodeInfo
      );
    case 'merge-call-node':
      return _mergeNodeInCallNodePath(transform.callNodePath, callNodePath);
    case 'merge-function':
      return _mergeFunctionInCallNodePath(transform.funcIndex, callNodePath);
    case 'drop-function':
      return _dropFunctionInCallNodePath(transform.funcIndex, callNodePath);
    case 'collapse-resource':
      return _collapseResourceInCallNodePath(
        transform.resourceIndex,
        transform.collapsedFuncIndex,
        transformedThread.funcTable,
        callNodePath
      );
    case 'collapse-direct-recursion':
      return _collapseDirectRecursionInCallNodePath(
        transform.funcIndex,
        callNodePath
      );
    case 'collapse-recursion':
      return _collapseRecursionInCallNodePath(
        transform.funcIndex,
        callNodePath
      );
    case 'collapse-function-subtree':
      return _collapseFunctionSubtreeInCallNodePath(
        transform.funcIndex,
        callNodePath
      );
    case 'filter-samples':
      // There's nothing to update in the call node path. But this call node path
      // could disappear if we filtered out all the samples with this path.
      // This is also the case for drop-function transform. We need to have a
      // generic mechanism for: if the selected call node (after the transformation
      // has been applied to the call path) is not present in the call tree, run
      // some generic code that finds a close-by call node which is present.
      // See: https://github.com/firefox-devtools/profiler/issues/4618
      return callNodePath;
    default:
      throw assertExhaustiveCheck(transform);
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

function _startCallNodePathWithFunction(
  funcIndex: IndexIntoFuncTable,
  callNodePath: CallNodePath
): CallNodePath {
  const startIndex = callNodePath.indexOf(funcIndex);
  return startIndex === -1 ? [] : callNodePath.slice(startIndex);
}

function _mergeNodeInCallNodePath(
  prefixPath: CallNodePath,
  callNodePath: CallNodePath
): CallNodePath {
  return _callNodePathHasPrefixPath(prefixPath, callNodePath)
    ? callNodePath.filter((_, i) => i !== prefixPath.length - 1)
    : callNodePath;
}

function _mergeFunctionInCallNodePath(
  funcIndex: IndexIntoFuncTable,
  callNodePath: CallNodePath
): CallNodePath {
  return callNodePath.filter((nodeFunc) => nodeFunc !== funcIndex);
}

function _dropFunctionInCallNodePath(
  funcIndex: IndexIntoFuncTable,
  callNodePath: CallNodePath
): CallNodePath {
  // If the CallNodePath contains the function, return an empty path.
  return callNodePath.includes(funcIndex) ? [] : callNodePath;
}

// removes all functions that are not in the category from the callNodePath
function _removeOtherCategoryFunctionsInNodePathWithFunction(
  category: IndexIntoCategoryList,
  callNodePath: CallNodePath,
  callNodeInfo: CallNodeInfo
): CallNodePath {
  const newCallNodePath = [];

  let prefix = -1;
  for (const funcIndex of callNodePath) {
    const callNodeIndex = callNodeInfo.getCallNodeIndexFromParentAndFunc(
      prefix,
      funcIndex
    );
    if (callNodeIndex === null) {
      throw new Error(
        `We couldn't find a node with prefix ${prefix} and func ${funcIndex}, this shouldn't happen.`
      );
    }

    if (callNodeInfo.categoryForNode(callNodeIndex) === category) {
      newCallNodePath.push(funcIndex);
    }

    prefix = callNodeIndex;
  }

  return newCallNodePath;
}

function _collapseResourceInCallNodePath(
  resourceIndex: IndexIntoResourceTable,
  collapsedFuncIndex: IndexIntoFuncTable,
  funcTable: FuncTable,
  callNodePath: CallNodePath
) {
  return (
    callNodePath
      // Map any collapsed functions into the collapsedFuncIndex
      .map((pathFuncIndex) => {
        return funcTable.resource[pathFuncIndex] === resourceIndex
          ? collapsedFuncIndex
          : pathFuncIndex;
      })
      // De-duplicate contiguous collapsed funcs
      .filter(
        (pathFuncIndex, pathIndex, path) =>
          // This function doesn't match the previous one, so keep it.
          pathFuncIndex !== path[pathIndex - 1] ||
          // This function matched the previous, only keep it if doesn't match the
          // collapsed func.
          pathFuncIndex !== collapsedFuncIndex
      )
  );
}

function _collapseDirectRecursionInCallNodePath(
  funcIndex: IndexIntoFuncTable,
  callNodePath: CallNodePath
) {
  const newPath = [];
  let previousFunc;
  for (let i = 0; i < callNodePath.length; i++) {
    const pathFunc = callNodePath[i];
    if (pathFunc !== funcIndex || pathFunc !== previousFunc) {
      newPath.push(pathFunc);
    }
    previousFunc = pathFunc;
  }
  return newPath;
}

function _collapseRecursionInCallNodePath(
  funcIndex: IndexIntoFuncTable,
  callNodePath: CallNodePath
) {
  const firstIndex = callNodePath.indexOf(funcIndex);
  const lastIndex = callNodePath.lastIndexOf(funcIndex);
  if (firstIndex === -1) {
    return callNodePath;
  }
  return callNodePath
    .slice(0, firstIndex)
    .concat(callNodePath.slice(lastIndex));
}

function _collapseFunctionSubtreeInCallNodePath(
  funcIndex: IndexIntoFuncTable,
  callNodePath: CallNodePath
) {
  const index = callNodePath.indexOf(funcIndex);
  return index === -1 ? callNodePath : callNodePath.slice(0, index + 1);
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
    const { stackTable, frameTable } = thread;
    // Depth here is 0 indexed.
    const depthAtCallNodePathLeaf = callNodePath.length - 1;
    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
    // A root stack's prefix will be null. Maintain that relationship from old to new
    // stacks by mapping from null to null.
    oldStackToNewStack.set(null, null);
    const newStackTable = getEmptyStackTable();
    // Provide two arrays to efficiently cache values for the algorithm. This probably
    // could be refactored to use only one array here.
    const stackDepths = [];
    const stackMatches = [];
    const funcMatchesImplementation = FUNC_MATCHES[implementation];
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const frameIndex = stackTable.frame[stackIndex];
      const category = stackTable.category[stackIndex];
      const subcategory = stackTable.subcategory[stackIndex];
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
        newStackTable.category[newStackIndex] = category;
        newStackTable.subcategory[newStackIndex] = subcategory;
        oldStackToNewStack.set(stackIndex, newStackIndex);
      }
    }

    return updateThreadStacks(
      thread,
      newStackTable,
      getMapStackUpdater(oldStackToNewStack)
    );
  });
}

/**
 * Go through the StackTable and "skip" any stacks with the given function.
 * This operation effectively merges the timing of the stacks into their callers.
 */
export function mergeFunction(
  thread: Thread,
  funcIndexToMerge: IndexIntoFuncTable
): Thread {
  const { stackTable, frameTable } = thread;

  // A map oldStack -> newStack+1, implemented as a Uint32Array for performance.
  // If newStack+1 is zero it means "null", i.e. this stack was filtered out.
  // Typed arrays are initialized to zero, which we interpret as null.
  //
  // For each old stack, the new stack is computed as follows:
  //  - If the old stack's function is not funcIndexToMerge, then the new stack
  //    is the same as the old stack.
  //  - If the old stack's function is funcIndexToMerge, then the new stack is
  //    the closest ancestor whose func is not funcIndexToMerge, or null if no
  //    such ancestor exists.
  //
  // We only compute a new prefix column; the other columns are copied from the
  // old stack table. The skipped stacks are "orphaned"; they'll still be present
  // in the new stack table but not referenced by samples or other stacks.
  const oldStackToNewStackPlusOne = new Uint32Array(stackTable.length);

  const stackTableFrameCol = stackTable.frame;
  const frameTableFuncCol = frameTable.func;
  const oldPrefixCol = stackTable.prefix;
  const newPrefixCol = new Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const oldPrefix = oldPrefixCol[stackIndex];
    const newPrefixPlusOne =
      oldPrefix === null ? 0 : oldStackToNewStackPlusOne[oldPrefix];

    const frameIndex = stackTableFrameCol[stackIndex];
    const funcIndex = frameTableFuncCol[frameIndex];
    if (funcIndex === funcIndexToMerge) {
      oldStackToNewStackPlusOne[stackIndex] = newPrefixPlusOne;
    } else {
      oldStackToNewStackPlusOne[stackIndex] = stackIndex + 1;
    }
    const newPrefix = newPrefixPlusOne === 0 ? null : newPrefixPlusOne - 1;
    newPrefixCol[stackIndex] = newPrefix;
  }

  const newStackTable = {
    ...stackTable,
    prefix: newPrefixCol,
  };

  return updateThreadStacks(thread, newStackTable, (oldStack) => {
    if (oldStack === null) {
      return null;
    }
    const newStackPlusOne = oldStackToNewStackPlusOne[oldStack];
    return newStackPlusOne === 0 ? null : newStackPlusOne - 1;
  });
}

/**
 * Drop any samples that contain the given function.
 */
export function dropFunction(
  thread: Thread,
  funcIndexToDrop: IndexIntoFuncTable
) {
  const { stackTable, frameTable } = thread;

  // Go through each stack, and label it as containing the function or not.
  // stackContainsFunc is a stackIndex => bool map, implemented as a U8 typed
  // array for better performance. 0 means false, 1 means true.
  const stackContainsFunc = new Uint8Array(stackTable.length);
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    if (
      // This is the function we want to remove.
      funcIndex === funcIndexToDrop ||
      // The parent of this stack contained the function.
      (prefix !== null && stackContainsFunc[prefix] === 1)
    ) {
      stackContainsFunc[stackIndex] = 1;
    }
  }

  return updateThreadStacks(thread, stackTable, (stack) =>
    // Drop the stacks that contain that function.
    stack !== null && stackContainsFunc[stack] === 1 ? null : stack
  );
}

export function collapseResource(
  thread: Thread,
  resourceIndexToCollapse: IndexIntoResourceTable,
  collapsedFuncIndex: IndexIntoFuncTable,
  implementation: ImplementationFilter,
  defaultCategory: IndexIntoCategoryList
): Thread {
  const { stackTable, funcTable, frameTable } = thread;
  const newFrameTable = shallowCloneFrameTable(frameTable);
  const newStackTable = getEmptyStackTable();
  const oldStackToNewStack: Map<
    IndexIntoStackTable | null,
    IndexIntoStackTable | null
  > = new Map();
  const prefixStackToCollapsedStack: Map<
    IndexIntoStackTable | null, // prefix stack index
    IndexIntoStackTable | null // collapsed stack index
  > = new Map();
  const collapsedStacks: Set<IndexIntoStackTable | null> = new Set();
  const funcMatchesImplementation = FUNC_MATCHES[implementation];

  // A root stack's prefix will be null. Maintain that relationship from old to new
  // stacks by mapping from null to null.
  oldStackToNewStack.set(null, null);
  // A new func and frame will be created on the first stack that is found that includes
  // the given resource.
  let collapsedFrameIndex;

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const category = stackTable.category[stackIndex];
    const subcategory = stackTable.subcategory[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const resourceIndex = funcTable.resource[funcIndex];
    const newStackPrefix = oldStackToNewStack.get(prefix);

    if (newStackPrefix === undefined) {
      throw new Error('newStackPrefix must not be undefined');
    }
    if (resourceIndex === resourceIndexToCollapse) {
      // The stack matches this resource.
      if (!collapsedStacks.has(newStackPrefix)) {
        // The prefix is not a collapsed stack. So this stack will not collapse into its
        // prefix stack. But it might collapse into a sibling stack, if there exists a
        // sibling with the same resource. Check if a collapsed stack with the same
        // prefix (i.e. a collapsed sibling) exists.

        const existingCollapsedStack = prefixStackToCollapsedStack.get(prefix);
        if (existingCollapsedStack === undefined) {
          // Create a new collapsed frame.

          // Compute the next indexes
          const newStackIndex = newStackTable.length++;
          collapsedStacks.add(newStackIndex);
          oldStackToNewStack.set(stackIndex, newStackIndex);
          prefixStackToCollapsedStack.set(prefix, newStackIndex);

          if (collapsedFrameIndex === undefined) {
            collapsedFrameIndex = newFrameTable.length++;
            // Add the collapsed frame
            newFrameTable.address.push(frameTable.address[frameIndex]);
            newFrameTable.inlineDepth.push(frameTable.inlineDepth[frameIndex]);
            newFrameTable.category.push(frameTable.category[frameIndex]);
            newFrameTable.subcategory.push(frameTable.subcategory[frameIndex]);
            newFrameTable.func.push(collapsedFuncIndex);
            newFrameTable.nativeSymbol.push(
              frameTable.nativeSymbol[frameIndex]
            );
            newFrameTable.line.push(frameTable.line[frameIndex]);
            newFrameTable.column.push(frameTable.column[frameIndex]);
            newFrameTable.innerWindowID.push(
              frameTable.innerWindowID[frameIndex]
            );
          }

          // Add the new stack.
          newStackTable.prefix.push(newStackPrefix);
          newStackTable.frame.push(collapsedFrameIndex);
          newStackTable.category.push(category);
          newStackTable.subcategory.push(subcategory);
        } else {
          // A collapsed stack at this level already exists, use that one.
          if (existingCollapsedStack === null) {
            throw new Error('existingCollapsedStack cannot be null');
          }
          oldStackToNewStack.set(stackIndex, existingCollapsedStack);
          if (newStackTable.category[existingCollapsedStack] !== category) {
            // Conflicting origin stack categories -> default category + subcategory.
            newStackTable.category[existingCollapsedStack] = defaultCategory;
            newStackTable.subcategory[existingCollapsedStack] = 0;
          } else if (
            newStackTable.subcategory[existingCollapsedStack] !== subcategory
          ) {
            // Conflicting origin stack subcategories -> "Other" subcategory.
            newStackTable.subcategory[existingCollapsedStack] = 0;
          }
        }
      } else {
        // The prefix was already collapsed, use that one.
        oldStackToNewStack.set(stackIndex, newStackPrefix);
      }
    } else {
      if (
        !funcMatchesImplementation(thread, funcIndex) &&
        newStackPrefix !== null
      ) {
        // This function doesn't match the implementation filter.
        const prefixFrame = newStackTable.frame[newStackPrefix];
        const prefixFunc = newFrameTable.func[prefixFrame];
        const prefixResource = funcTable.resource[prefixFunc];

        if (prefixResource === resourceIndexToCollapse) {
          // This stack's prefix did match the collapsed resource, map the stack
          // to the already collapsed stack and move on.
          oldStackToNewStack.set(stackIndex, newStackPrefix);
          continue;
        }
      }
      // This stack isn't part of the collapsed resource. Copy over the previous stack.
      const newStackIndex = newStackTable.length++;
      newStackTable.prefix.push(newStackPrefix);
      newStackTable.frame.push(frameIndex);
      newStackTable.category.push(category);
      newStackTable.subcategory.push(subcategory);
      oldStackToNewStack.set(stackIndex, newStackIndex);
    }
  }

  const newThread = {
    ...thread,
    frameTable: newFrameTable,
  };

  return updateThreadStacks(
    newThread,
    newStackTable,
    getMapStackUpdater(oldStackToNewStack)
  );
}

export function collapseDirectRecursion(
  thread: Thread,
  funcToCollapse: IndexIntoFuncTable,
  implementation: ImplementationFilter
): Thread {
  // Collapse recursion by reparenting stack nodes for all "inner" frames of a
  // recursion to the same level as the outermost frame.
  //
  // Example with recursion on B:
  //  - A1                    - A1
  //    - B1                    - B1
  //      - B2                  - B2
  //        - B3        ->      - B3
  //           - C1               - C1
  //      - B4                  - B4
  //        - C2                  - C2
  //
  // In the call tree, sibling stack nodes with the same function will be
  // collapsed into one call node.
  // We keep all the stack nodes and frames, we just rewire them such that the
  // outer stack nodes of the recursion are skipped. We skip the outer nodes
  // rather than the inner nodes, so that per-frame data such as line numbers and
  // frame addresses are counted for the innermost frame in a stack. We prefer
  // keeping this information for the innermost frame because the outer frames
  // just have the line and instruction address of the recursive call, and the
  // purpose of "collapsing recursion" is to ignore that recursive call.
  //
  // This transform has to be aware of the implementation filter, because the
  // implementation filter affects whether we consider a recursive call to be a
  // "direct" recursive call, i.e. it affects the question "Is function X
  // directly called by function X?"
  // If the implementation filter is set to JS, then we want the answer to this
  // question be "Yes" for the call Xjs -> Ycpp -> Xjs.
  //
  // Here's a more complete example. We want to make the following case work:
  // Full:     Ajs -> Xcpp -> Bjs -> Ycpp -> Bjs -> Zcpp -> Bjs -> Wcpp
  // JS-only:  Ajs -> Bjs -> Bjs -> Bjs
  // Now collapse recursion on Bjs.
  // Collapsed JS-only:  Ajs -> Bjs
  // Now switch back to all stack types.
  // Collapsed full:     Ajs -> Xcpp -> Bjs -> Wcpp

  const { stackTable, frameTable } = thread;
  // Map stack indices that are funcToCheck or have a funcToCheck parent, ignoring other implementations,
  // to the parent stack index of the outermost recursive funcToCheck.
  // E.g. B3 -> A1 in the example.
  const recursionChainPrefixForStack = new Map<
    IndexIntoStackTable,
    IndexIntoStackTable | null
  >();
  const funcMatchesImplementation = FUNC_MATCHES[implementation];
  const newStackTablePrefixColumn = stackTable.prefix.slice();

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];

    const recursionChainPrefix =
      prefix !== null ? recursionChainPrefixForStack.get(prefix) : undefined;
    if (recursionChainPrefix === undefined) {
      // Our prefix was not part of a recursion chain.
      // If this stack frame matches the collapsed func, this stack node is the root
      // of a recursion chain.
      if (funcIndex === funcToCollapse) {
        recursionChainPrefixForStack.set(stackIndex, prefix);
      }
    } else {
      // Our prefix is part of a recursion chain.
      if (funcMatchesImplementation(thread, funcIndex)) {
        if (funcIndex === funcToCollapse) {
          // The recursion chain continues.
          recursionChainPrefixForStack.set(stackIndex, recursionChainPrefix);
          // Reparent this stack node to the recursion root's prefix.
          newStackTablePrefixColumn[stackIndex] = recursionChainPrefix;
        } else {
          // The recursion chain ends here. Leave recursionChainPrefixForStack
          // empty for stackIndex.
        }
      } else {
        // This stack node doesn't match the transform's implementation filter.
        // For example, this stack node could be Xcpp in the following recursive
        // JS invocation: Ajs -> Xcpp -> Ajs
        // Keep the recursion chain going.
        recursionChainPrefixForStack.set(stackIndex, recursionChainPrefix);
      }
    }
  }

  // Since we're keeping all stack indexes unchanged, none of the other tables
  // in the thread need to be updated. Only the stackTable's prefix column has
  // changed.
  return {
    ...thread,
    stackTable: {
      ...stackTable,
      prefix: newStackTablePrefixColumn,
    },
  };
}

export function collapseRecursion(
  thread: Thread,
  funcToCollapse: IndexIntoFuncTable
): Thread {
  // Collapse recursion by reparenting stack nodes for all "inner" frames of a
  // recursion to the same level as the outermost frame.
  //
  // Example with recursion on B:
  //  - A1                    - A1
  //    - B1                    - B1
  //      - C1                    - C1
  //        - B2        ->          - D2
  //          - D1              - B2
  //        - D2                  - D1
  //      - B3                  - B3
  //        - D3                  - D3
  //    - C2                    - C2
  //      - D4                    - D4
  //
  // In the call tree, sibling stack nodes with the same function will be
  // collapsed into one call node.
  // We keep all the stack nodes and frames, we just rewire them such that the
  // outer stack nodes of the recursion are skipped. We skip the outer nodes
  // rather than the inner nodes, so that per-frame data such as line numbers and
  // frame addresses are counted for the innermost frame in a stack. We prefer
  // keeping this information for the innermost frame because the outer frames
  // just have the line and instruction address of the recursive call, and the
  // purpose of "collapsing recursion" is to ignore that recursive call.
  //
  // We can ignore the transform's implementation filter. This is a difference
  // compared to the "collapse direct recursion" transform: The "collapse direct
  // recursion" transform has to be aware of the implementation filter because
  // the implementation filter affects the "directness" check, but we don't have
  // such a check here.

  const { stackTable, frameTable } = thread;

  // Map all stack indexes that are inside a funcToCollapse subtree to the
  // parent stack index of the funcToCollapse subtree root.
  // In the example, all stack nodes under the B1 subtree would be mapped to
  // B1's prefix A1.
  const funcToCollapseSubtreePrefixForStack = new Map<
    IndexIntoStackTable,
    IndexIntoStackTable | null
  >();
  const newStackTablePrefixColumn = stackTable.prefix.slice();

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];

    const subtreePrefix =
      prefix !== null
        ? funcToCollapseSubtreePrefixForStack.get(prefix)
        : undefined;
    if (subtreePrefix === undefined) {
      // Our prefix was not part of a funcToCollapse subtree.
      // If this stack frame matches the collapsed func, this stack node is the
      // root of a subtree.
      if (funcIndex === funcToCollapse) {
        funcToCollapseSubtreePrefixForStack.set(stackIndex, prefix);
      }
    } else {
      // Our prefix is part of a funcToCollapse subtree.
      funcToCollapseSubtreePrefixForStack.set(stackIndex, subtreePrefix);
      if (funcIndex === funcToCollapse) {
        // We found a recursive call!
        // Reparent this stack node to the recursion root's prefix.
        newStackTablePrefixColumn[stackIndex] = subtreePrefix;
      }
    }
  }

  // Since we're keeping all stack indexes unchanged, none of the other tables
  // in the thread need to be updated. Only the stackTable's prefix column has
  // changed.
  return {
    ...thread,
    stackTable: {
      ...stackTable,
      prefix: newStackTablePrefixColumn,
    },
  };
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
    return (
      thread.funcTable.isJS[funcIndex] ||
      thread.funcTable.relevantForJS[funcIndex]
    );
  },
};

export function collapseFunctionSubtree(
  thread: Thread,
  funcToCollapse: IndexIntoFuncTable
): Thread {
  const { stackTable, frameTable } = thread;
  const oldStackToNewStack = new Int32Array(stackTable.length);
  const isInCollapsedSubtree = new Uint8Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    if (prefix !== null && isInCollapsedSubtree[prefix] !== 0) {
      oldStackToNewStack[stackIndex] = oldStackToNewStack[prefix];
      isInCollapsedSubtree[stackIndex] = 1;
    } else {
      oldStackToNewStack[stackIndex] = stackIndex;
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];
      if (funcToCollapse === funcIndex) {
        isInCollapsedSubtree[stackIndex] = 1;
      }
    }
  }

  return updateThreadStacks(thread, thread.stackTable, (oldStack) => {
    if (oldStack === null) {
      return null;
    }
    return oldStackToNewStack[oldStack];
  });
}

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
    const { stackTable, frameTable } = thread;
    const prefixDepth = callNodePath.length;
    const stackMatches = new Int32Array(stackTable.length);
    const funcMatchesImplementation = FUNC_MATCHES[implementation];
    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
    // A root stack's prefix will be null. Maintain that relationship from old to new
    // stacks by mapping from null to null.
    oldStackToNewStack.set(null, null);
    const newStackTable = getEmptyStackTable();
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const prefixMatchesUpTo = prefix !== null ? stackMatches[prefix] : 0;
      let stackMatchesUpTo = -1;
      if (prefixMatchesUpTo !== -1) {
        const frame = stackTable.frame[stackIndex];
        const category = stackTable.category[stackIndex];
        const subcategory = stackTable.subcategory[stackIndex];
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
          newStackTable.prefix[newStackIndex] = newStackPrefix ?? null;
          newStackTable.frame[newStackIndex] = frame;
          newStackTable.category[newStackIndex] = category;
          newStackTable.subcategory[newStackIndex] = subcategory;
          oldStackToNewStack.set(stackIndex, newStackIndex);
        }
      }
      stackMatches[stackIndex] = stackMatchesUpTo;
    }

    return updateThreadStacks(thread, newStackTable, (oldStack) => {
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
    const { stackTable, frameTable } = thread;
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
    // A root stack's prefix will be null. Maintain that relationship from old to new
    // stacks by mapping from null to null.
    oldStackToNewStack.set(null, null);

    return updateThreadStacks(thread, stackTable, (stackIndex) => {
      let newStackIndex = oldStackToNewStack.get(stackIndex);
      if (newStackIndex === undefined) {
        newStackIndex = convertStack(stackIndex);
        oldStackToNewStack.set(stackIndex, newStackIndex);
      }
      return newStackIndex;
    });
  });
}

export function focusFunction(
  thread: Thread,
  funcIndexToFocus: IndexIntoFuncTable
): Thread {
  return timeCode('focusFunction', () => {
    const { stackTable, frameTable } = thread;
    // A map oldStack -> newStack+1, implemented as a Uint32Array for performance.
    // If newStack+1 is zero it means "null", i.e. this stack was filtered out.
    // Typed arrays are initialized to zero, which we interpret as null.
    const oldStackToNewStackPlusOne = new Uint32Array(stackTable.length);

    const newStackTable = getEmptyStackTable();
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const frameIndex = stackTable.frame[stackIndex];
      const funcIndex = frameTable.func[frameIndex];

      const newPrefixPlusOne =
        prefix === null ? 0 : oldStackToNewStackPlusOne[prefix];
      const newPrefix = newPrefixPlusOne === 0 ? null : newPrefixPlusOne - 1;
      if (newPrefix !== null || funcIndex === funcIndexToFocus) {
        const newStackIndex = newStackTable.length++;
        newStackTable.prefix[newStackIndex] = newPrefix;
        newStackTable.frame[newStackIndex] = frameIndex;
        newStackTable.category[newStackIndex] = stackTable.category[stackIndex];
        newStackTable.subcategory[newStackIndex] =
          stackTable.subcategory[stackIndex];
        oldStackToNewStackPlusOne[stackIndex] = newStackIndex + 1;
      }
    }

    return updateThreadStacks(thread, newStackTable, (oldStack) => {
      if (oldStack === null) {
        return null;
      }
      const newStackPlusOne = oldStackToNewStackPlusOne[oldStack];
      return newStackPlusOne === 0 ? null : newStackPlusOne - 1;
    });
  });
}

export function focusCategory(thread: Thread, category: IndexIntoCategoryList) {
  return timeCode('focusCategory', () => {
    const { stackTable } = thread;
    const oldStackToNewStack: Map<
      IndexIntoStackTable | null,
      IndexIntoStackTable | null
    > = new Map();
    oldStackToNewStack.set(null, null);

    const newStackTable = getEmptyStackTable();

    // fill the new stack table with the kept frames
    for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
      const prefix = stackTable.prefix[stackIndex];
      const newPrefix = oldStackToNewStack.get(prefix);
      if (newPrefix === undefined) {
        throw new Error('The prefix should not map to an undefined value');
      }

      if (stackTable.category[stackIndex] !== category) {
        oldStackToNewStack.set(stackIndex, newPrefix);
        continue;
      }

      const newStackIndex = newStackTable.length++;
      newStackTable.prefix[newStackIndex] = newPrefix;
      newStackTable.frame[newStackIndex] = stackTable.frame[stackIndex];
      newStackTable.category[newStackIndex] = stackTable.category[stackIndex];
      newStackTable.subcategory[newStackIndex] =
        stackTable.subcategory[stackIndex];
      oldStackToNewStack.set(stackIndex, newStackIndex);
    }
    const updated = updateThreadStacks(
      thread,
      newStackTable,
      getMapStackUpdater(oldStackToNewStack)
    );
    return updated;
  });
}

/**
 * When restoring function in a CallNodePath there can be multiple correct CallNodePaths
 * that could be restored. The best approach would probably be to restore to the
 * "heaviest" callstack in the call tree (i.e. the one that is displayed first in the
 * calltree because it has the most samples under it.) This function only finds the first
 * match and returns it.
 */
export function restoreAllFunctionsInCallNodePath(
  thread: Thread,
  previousImplementationFilter: ImplementationFilter,
  callNodePath: CallNodePath
): CallNodePath {
  const { stackTable, frameTable } = thread;
  const funcMatchesImplementation = FUNC_MATCHES[previousImplementationFilter];
  // For every stackIndex, matchesUpToDepth[stackIndex] will be:
  //  - null if stackIndex does not match the callNodePath
  //  - <depth> if stackIndex matches callNodePath up to (and including) callNodePath[<depth>]
  const matchesUpToDepth = [];
  let tipStackIndex = null;
  // Try to find the tip most stackIndex in the CallNodePath, but skip anything
  // that doesn't match the previous implementation filter.
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefix = stackTable.prefix[stackIndex];
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const prefixPathDepth = prefix === null ? -1 : matchesUpToDepth[prefix];

    if (prefixPathDepth === null) {
      continue;
    }

    const pathDepth = prefixPathDepth + 1;
    const nextPathFuncIndex = callNodePath[pathDepth];
    if (nextPathFuncIndex === funcIndex) {
      // This function is a match.
      matchesUpToDepth[stackIndex] = pathDepth;
      if (pathDepth === callNodePath.length - 1) {
        // The tip of the CallNodePath has been found.
        tipStackIndex = stackIndex;
        break;
      }
    } else if (!funcMatchesImplementation(thread, funcIndex)) {
      // This function didn't match, but it also wasn't in the previous implementation.
      // Keep on searching for a match.
      matchesUpToDepth[stackIndex] = prefixPathDepth;
    } else {
      matchesUpToDepth[stackIndex] = null;
    }
  }

  // Turn the stack index into a CallNodePath
  if (tipStackIndex === null) {
    return [];
  }
  const newCallNodePath = [];
  for (
    let stackIndex = tipStackIndex;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    newCallNodePath.push(funcIndex);
  }
  return newCallNodePath.reverse();
}

export function getStackType(
  thread: Thread,
  funcIndex: IndexIntoFuncTable
): StackType {
  if (FUNC_MATCHES.cpp(thread, funcIndex)) {
    return 'native';
  } else if (FUNC_MATCHES.js(thread, funcIndex)) {
    return 'js';
  }
  return 'unsymbolicated';
}

export function filterCallNodePathByImplementation(
  thread: Thread,
  implementationFilter: ImplementationFilter,
  callNodePath: CallNodePath
): CallNodePath {
  const funcMatchesImplementation = FUNC_MATCHES[implementationFilter];
  return callNodePath.filter((funcIndex) =>
    funcMatchesImplementation(thread, funcIndex)
  );
}

// User-facing properties about a stack frame.
export type BacktraceItem = {
  // The function name of the stack frame.
  funcName: string;
  // The frame category of the stack frame.
  category: IndexIntoCategoryList;
  // Whether this frame is a label frame.
  isFrameLabel: boolean;
  // A string which is usually displayed after the function name, and which
  // describes, in some way, where this function or frame came from.
  // If known, this contains the file name of the function, and the line and
  // column number of the frame, i.e. the spot within the function that was
  // being executed.
  // If the source file name is not known, this might be the name of a native
  // library instead.
  // May also be empty.
  origin: string;
};

/**
 * Convert the stack into an array of "backtrace items" for each stack frame.
 * The returned array is ordered from callee-most to caller-most, i.e. the root
 * caller is at the end.
 */
export function getBacktraceItemsForStack(
  stack: IndexIntoStackTable,
  implementationFilter: ImplementationFilter,
  thread: Thread
): BacktraceItem[] {
  const { funcTable, stringTable, resourceTable } = thread;

  const { stackTable, frameTable } = thread;
  const unfilteredPath = [];
  for (
    let stackIndex = stack;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    const frameIndex = stackTable.frame[stackIndex];
    unfilteredPath.push({
      category: stackTable.category[stackIndex],
      funcIndex: frameTable.func[frameIndex],
      frameLine: frameTable.line[frameIndex],
      frameColumn: frameTable.column[frameIndex],
    });
  }

  const funcMatchesImplementation = FUNC_MATCHES[implementationFilter];
  const path = unfilteredPath.filter(({ funcIndex }) =>
    funcMatchesImplementation(thread, funcIndex)
  );
  return path.map(({ category, funcIndex, frameLine, frameColumn }) => {
    return {
      funcName: stringTable.getString(funcTable.name[funcIndex]),
      category: category,
      isFrameLabel: funcTable.resource[funcIndex] === -1,
      origin: getOriginAnnotationForFunc(
        funcIndex,
        funcTable,
        resourceTable,
        stringTable,
        frameLine,
        frameColumn
      ),
    };
  });
}

/**
 * Search through the entire call node table and see if there are any examples of
 * direct recursion of funcToCheck.
 */
export function funcHasDirectRecursiveCall(
  callNodeTable: CallNodeTable,
  funcToCheck: IndexIntoFuncTable
) {
  for (let i = 0; i < callNodeTable.length; i++) {
    if (callNodeTable.func[i] === funcToCheck) {
      const prefix = callNodeTable.prefix[i];
      if (prefix !== null && callNodeTable.func[prefix] === funcToCheck) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Search through the entire call node table and see if there are any examples of
 * recursion of funcToCheck (direct or indirect).
 */
export function funcHasRecursiveCall(
  callNodeTable: CallNodeTable,
  funcToCheck: IndexIntoFuncTable
) {
  // Set of stack indices that are funcToCheck or have a funcToCheck ancestor.
  const ancestorOfCallNodeContainsFuncToCheck = new Uint8Array(
    callNodeTable.length
  );

  for (let i = 0; i < callNodeTable.length; i++) {
    const prefix = callNodeTable.prefix[i];
    const funcIndex = callNodeTable.func[i];
    const recursivePrefix =
      prefix !== -1 && ancestorOfCallNodeContainsFuncToCheck[prefix] !== 0;

    if (funcToCheck === funcIndex) {
      if (recursivePrefix) {
        // This function matches and so did one of its ancestors.
        return true;
      }
      ancestorOfCallNodeContainsFuncToCheck[i] = 1;
    } else if (recursivePrefix) {
      ancestorOfCallNodeContainsFuncToCheck[i] = 1;
    }
  }
  return false;
}

function _findRangesByMarkerFilter(
  getMarker: (MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  markerSchemaByName: MarkerSchemaByName,
  stringTable: StringTable,
  categoryList: CategoryList,
  filter: string
): StartEndRange[] {
  const ranges = [];

  const searchRegExps = stringsToMarkerRegExps(splitSearchString(filter));
  const searchFilteredMarkerIndexes = getSearchFilteredMarkerIndexes(
    getMarker,
    markerIndexes,
    markerSchemaByName,
    searchRegExps,
    stringTable,
    categoryList
  );

  for (const markerIndex of searchFilteredMarkerIndexes) {
    const { start, end } = getMarker(markerIndex);

    if (start === null || end === null) {
      // This is not an interval marker, so we can't use it as a range.
      continue;
    }

    ranges.push({ start: start, end: end });
  }
  return ranges;
}

/**
 * Find the sample ranges to filter depending on the filter type, then go
 * through all the samples and remove the ones that are outside of the ranges.
 */
export function filterSamples(
  thread: Thread,
  getMarker: (MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  markerSchemaByName: MarkerSchemaByName,
  categoryList: CategoryList,
  filterType: FilterSamplesType,
  filter: string
): Thread {
  return timeCode('filterSamples', () => {
    // Find the ranges to filter.
    function getFilterRanges(): StartEndRange[] {
      switch (filterType) {
        case 'marker-search':
          return _findRangesByMarkerFilter(
            getMarker,
            markerIndexes,
            markerSchemaByName,
            thread.stringTable,
            categoryList,
            filter
          );
        default:
          throw assertExhaustiveCheck(filterType);
      }
    }

    const ranges = canonicalizeRangeSet(getFilterRanges());

    function computeFilteredStackColumn(
      originalStackColumn: Array<IndexIntoStackTable | null>,
      timeColumn: Milliseconds[]
    ): Array<IndexIntoStackTable | null> {
      const newStackColumn = originalStackColumn.slice();

      // Walk the ranges and samples in order. Both are sorted by time.
      // For each range, drop the samples before the range and skip the samples
      // inside the range.
      let sampleIndex = 0;
      const sampleCount = timeColumn.length;
      for (const range of ranges) {
        const { start: rangeStart, end: rangeEnd } = range;
        // Drop samples before the range.
        for (; sampleIndex < sampleCount; sampleIndex++) {
          if (timeColumn[sampleIndex] >= rangeStart) {
            break;
          }
          newStackColumn[sampleIndex] = null;
        }

        // Skip over samples inside the range.
        for (; sampleIndex < sampleCount; sampleIndex++) {
          if (timeColumn[sampleIndex] >= rangeEnd) {
            break;
          }
        }
      }

      // Drop the remaining samples, i.e. the samples after the last range.
      while (sampleIndex < sampleCount) {
        newStackColumn[sampleIndex] = null;
        sampleIndex++;
      }

      return newStackColumn;
    }

    return updateThreadStacksByGeneratingNewStackColumns(
      thread,
      thread.stackTable,
      computeFilteredStackColumn,
      computeFilteredStackColumn,
      (markerData) => markerData
    );
  });
}

export function applyTransform(
  thread: Thread,
  transform: Transform,
  defaultCategory: IndexIntoCategoryList,
  getMarker: (MarkerIndex) => Marker,
  markerIndexes: MarkerIndex[],
  markerSchemaByName: MarkerSchemaByName,
  categoryList: CategoryList
): Thread {
  switch (transform.type) {
    case 'focus-subtree':
      return transform.inverted
        ? focusInvertedSubtree(
            thread,
            transform.callNodePath,
            transform.implementation
          )
        : focusSubtree(
            thread,
            transform.callNodePath,
            transform.implementation
          );
    case 'merge-call-node':
      return mergeCallNode(
        thread,
        transform.callNodePath,
        transform.implementation
      );
    case 'merge-function':
      return mergeFunction(thread, transform.funcIndex);
    case 'drop-function':
      return dropFunction(thread, transform.funcIndex);
    case 'focus-function':
      return focusFunction(thread, transform.funcIndex);
    case 'focus-category':
      return focusCategory(thread, transform.category);
    case 'collapse-resource':
      return collapseResource(
        thread,
        transform.resourceIndex,
        transform.collapsedFuncIndex,
        transform.implementation,
        defaultCategory
      );
    case 'collapse-direct-recursion':
      return collapseDirectRecursion(
        thread,
        transform.funcIndex,
        transform.implementation
      );
    case 'collapse-recursion':
      return collapseRecursion(thread, transform.funcIndex);
    case 'collapse-function-subtree':
      return collapseFunctionSubtree(thread, transform.funcIndex);
    case 'filter-samples':
      return filterSamples(
        thread,
        getMarker,
        markerIndexes,
        markerSchemaByName,
        categoryList,
        transform.filterType,
        transform.filter
      );
    default:
      throw assertExhaustiveCheck(transform);
  }
}
