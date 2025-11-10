/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Thread, Lib, ThreadIndex } from 'firefox-profiler/types';
import type { FunctionMap } from './function-map';

export type FunctionData = {
  funcName: string;
  funcIndex: number;
  total: number;
  self: number;
  totalRelative: number;
  selfRelative: number;
};

export type FunctionListStats = {
  omittedCount: number;
  maxTotal: number;
  maxSelf: number;
  sumSelf: number;
};

export type FormattedFunctionList = {
  title: string;
  lines: string[];
  stats: FunctionListStats | null;
};

/**
 * A tree node representing a segment of a function name that can be truncated.
 */
type TruncNode = {
  type: 'text' | 'nested';
  text: string; // For text nodes, the actual text. For nested, empty.
  openBracket?: string; // '(' or '<' for nested nodes
  closeBracket?: string; // ')' or '>' for nested nodes
  children: TruncNode[]; // Child nodes (for nested nodes)
};

/**
 * Parse a function name into a tree structure.
 * Each nested section (templates, parameters) becomes a tree node that can be collapsed.
 */
function parseFunctionNameTree(name: string): TruncNode[] {
  const stack: TruncNode[][] = [[]]; // Stack of node lists
  let currentText = '';

  const flushText = () => {
    if (currentText) {
      stack[stack.length - 1].push({
        type: 'text',
        text: currentText,
        children: [],
      });
      currentText = '';
    }
  };

  for (let i = 0; i < name.length; i++) {
    const char = name[i];

    if (char === '<' || char === '(') {
      flushText();

      // Create a new nested node
      const nestedNode: TruncNode = {
        type: 'nested',
        text: '',
        openBracket: char,
        closeBracket: char === '<' ? '>' : ')',
        children: [],
      };

      // Add to current level
      stack[stack.length - 1].push(nestedNode);

      // Push a new level for the nested content
      stack.push(nestedNode.children);
    } else if (char === '>' || char === ')') {
      flushText();

      // Pop back to parent level
      if (stack.length > 1) {
        stack.pop();
      }
    } else {
      currentText += char;
    }
  }

  flushText();
  return stack[0];
}

/**
 * Render a tree of nodes to a string.
 */
function renderTree(nodes: TruncNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        return node.text;
      }
      // Nested node
      const inner = renderTree(node.children);
      return `${node.openBracket}${inner}${node.closeBracket}`;
    })
    .join('');
}

/**
 * Calculate the length of a tree if fully rendered.
 */
function treeLength(nodes: TruncNode[]): number {
  return nodes.reduce((len, node) => {
    if (node.type === 'text') {
      return len + node.text.length;
    }
    // Nested: brackets + children
    return len + 2 + treeLength(node.children); // 2 for open/close brackets
  }, 0);
}

/**
 * Truncate a tree to fit within maxLength characters.
 * Collapses nested nodes to `<...>` or `(...)` when needed.
 */
function truncateTree(nodes: TruncNode[], maxLength: number): string {
  if (treeLength(nodes) <= maxLength) {
    return renderTree(nodes);
  }

  let result = '';

  for (const node of nodes) {
    const spaceLeft = maxLength - result.length;
    if (spaceLeft <= 0) {
      break;
    }

    if (node.type === 'text') {
      if (node.text.length <= spaceLeft) {
        result += node.text;
      } else {
        // Truncate text, trying to break at :: for namespaces
        const parts = node.text.split('::');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i] + (i < parts.length - 1 ? '::' : '');
          if (result.length + part.length <= maxLength) {
            result += part;
          } else {
            break;
          }
        }
        break;
      }
    } else {
      // Nested node
      const fullNested = renderTree(node.children);
      const fullWithBrackets = `${node.openBracket}${fullNested}${node.closeBracket}`;
      const collapsed = `${node.openBracket}...${node.closeBracket}`;

      if (fullWithBrackets.length <= spaceLeft) {
        // Full content fits
        result += fullWithBrackets;
      } else if (collapsed.length <= spaceLeft) {
        // Try to recursively truncate children
        const availableForChildren = spaceLeft - 2; // 2 for brackets
        const truncatedChildren = truncateTree(
          node.children,
          availableForChildren
        );

        if (truncatedChildren.length <= availableForChildren) {
          result += `${node.openBracket}${truncatedChildren}${node.closeBracket}`;
        } else {
          // Just collapse
          result += collapsed;
        }
      } else {
        // Can't even fit collapsed version
        break;
      }
    }
  }

  return result;
}

/**
 * Find the last top-level `::` separator in a tree (not inside any nesting).
 * Returns the index in the nodes array and position within that text node.
 */
function findLastTopLevelSeparator(
  nodes: TruncNode[]
): { nodeIndex: number; position: number } | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.type === 'text') {
      const lastColons = node.text.lastIndexOf('::');
      if (lastColons !== -1) {
        return { nodeIndex: i, position: lastColons };
      }
    }
  }
  return null;
}

/**
 * Intelligently truncate a function name, preserving context and function name.
 * Handles library prefixes (e.g., "nvoglv64.dll!functionName") by processing
 * only the function name portion.
 */
export function truncateFunctionName(
  functionName: string,
  maxLength: number
): string {
  if (functionName.length <= maxLength) {
    return functionName;
  }

  // Check if there's a library prefix (e.g., "nvoglv64.dll!functionName")
  const bangIndex = functionName.indexOf('!');
  let libraryPrefix = '';
  let funcPart = functionName;

  if (bangIndex !== -1) {
    libraryPrefix = functionName.substring(0, bangIndex + 1); // Include the '!'
    funcPart = functionName.substring(bangIndex + 1);

    // Calculate space available for function name after prefix
    const availableForFunc = maxLength - libraryPrefix.length;

    if (availableForFunc <= 10) {
      // Library prefix is too long, fall back to simple truncation
      return functionName.substring(0, maxLength - 3) + '...';
    }

    // If the function part fits, return it
    if (funcPart.length <= availableForFunc) {
      return functionName;
    }

    // Otherwise, truncate the function part smartly
    maxLength = availableForFunc;
  }

  // Parse into tree
  const tree = parseFunctionNameTree(funcPart);

  // Find the last top-level :: separator to split prefix/suffix
  const separator = findLastTopLevelSeparator(tree);

  if (separator === null) {
    // No namespace separator - just truncate the whole thing
    return libraryPrefix + truncateTree(tree, maxLength);
  }

  // Split into prefix (context) and suffix (function name)
  const { nodeIndex, position } = separator;
  const sepNode = tree[nodeIndex];

  // Build prefix nodes
  const prefixNodes: TruncNode[] = tree.slice(0, nodeIndex);
  if (position > 0) {
    // Include part of the separator node before ::
    prefixNodes.push({
      type: 'text',
      text: sepNode.text.substring(0, position + 2), // Include the ::
      children: [],
    });
  } else {
    prefixNodes.push({
      type: 'text',
      text: '::',
      children: [],
    });
  }

  // Build suffix nodes
  const suffixNodes: TruncNode[] = [];
  const remainingText = sepNode.text.substring(position + 2);
  if (remainingText) {
    suffixNodes.push({
      type: 'text',
      text: remainingText,
      children: [],
    });
  }
  suffixNodes.push(...tree.slice(nodeIndex + 1));

  const prefixLen = treeLength(prefixNodes);
  const suffixLen = treeLength(suffixNodes);

  // Check if both fit
  if (prefixLen + suffixLen <= maxLength) {
    return libraryPrefix + funcPart;
  }

  // Allocate space: prioritize suffix (function name), up to 70%
  const maxSuffixLen = Math.floor(maxLength * 0.7);
  let suffixAlloc: number;
  let prefixAlloc: number;

  if (suffixLen <= maxSuffixLen) {
    // Suffix fits fully, give rest to prefix
    suffixAlloc = suffixLen;
    prefixAlloc = maxLength - suffixLen;
  } else {
    // Both need truncation - give at least 30% to prefix for context
    prefixAlloc = Math.floor(maxLength * 0.3);
    suffixAlloc = maxLength - prefixAlloc;
  }

  const truncatedPrefix = truncateTree(prefixNodes, prefixAlloc);
  const truncatedSuffix = truncateTree(suffixNodes, suffixAlloc);

  return libraryPrefix + truncatedPrefix + truncatedSuffix;
}

/**
 * Format a function name with its library/resource name.
 * Returns "libraryName!functionName" or just "functionName" if no library is available.
 */
export function formatFunctionNameWithLibrary(
  funcIndex: number,
  thread: Thread,
  libs: Lib[]
): string {
  const funcName = thread.stringTable.getString(
    thread.funcTable.name[funcIndex]
  );
  const resourceIndex = thread.funcTable.resource[funcIndex];

  // If there's no resource or it's -1, just return the function name
  if (resourceIndex === -1) {
    return funcName;
  }

  // Get the resource name
  const resourceName = thread.stringTable.getString(
    thread.resourceTable.name[resourceIndex]
  );

  // Get the library name if available
  const libIndex = thread.resourceTable.lib[resourceIndex];
  if (libIndex !== null && libs) {
    const lib = libs[libIndex];
    // Use the library name (e.g., "nvoglv64.dll") rather than full path
    const libName = lib.name;
    return `${libName}!${funcName}`;
  }

  // Fall back to resource name if no library
  if (resourceName && resourceName !== funcName) {
    return `${resourceName}!${funcName}`;
  }

  return funcName;
}

/**
 * Extract function data from a CallTree (function list tree).
 * Formats function names with library/resource information when available.
 */
export function extractFunctionData(
  tree: {
    getRoots(): number[];
    getNodeData(nodeIndex: number): {
      total: number;
      self: number;
      totalRelative: number;
      selfRelative: number;
    };
  },
  thread: Thread,
  libs: Lib[]
): FunctionData[] {
  const roots = tree.getRoots();
  return roots.map((nodeIndex) => {
    const data = tree.getNodeData(nodeIndex);
    // The node index IS the function index for function list trees
    const formattedName = formatFunctionNameWithLibrary(
      nodeIndex,
      thread,
      libs
    );
    return {
      ...data,
      funcName: formattedName,
      funcIndex: nodeIndex, // Preserve the function index
    };
  });
}

/**
 * Sort functions by total time (descending).
 */
export function sortByTotal(functions: FunctionData[]): FunctionData[] {
  return [...functions].sort((a, b) => b.total - a.total);
}

/**
 * Sort functions by self time (descending).
 */
export function sortBySelf(functions: FunctionData[]): FunctionData[] {
  return [...functions].sort((a, b) => b.self - a.self);
}

/**
 * Format a single function entry with optional handle.
 */
function formatFunctionEntry(
  func: FunctionData,
  sortKey: 'total' | 'self',
  threadIndexes: Set<ThreadIndex>,
  functionMap: FunctionMap
): string {
  const totalPct = (func.totalRelative * 100).toFixed(1);
  const selfPct = (func.selfRelative * 100).toFixed(1);
  const totalCount = Math.round(func.total);
  const selfCount = Math.round(func.self);

  // Truncate function name to 120 characters (smart truncation preserves meaning)
  const displayName = truncateFunctionName(func.funcName, 120);

  // Generate handle if FunctionMap is provided
  const handle = functionMap.handleForFunction(threadIndexes, func.funcIndex);
  const handleStr = `${handle}. `;

  if (sortKey === 'total') {
    return `  ${handleStr}${displayName} - total: ${totalCount} (${totalPct}%), self: ${selfCount} (${selfPct}%)`;
  }
  return `  ${handleStr}${displayName} - self: ${selfCount} (${selfPct}%), total: ${totalCount} (${totalPct}%)`;
}

/**
 * Compute statistics for omitted functions.
 */
function computeOmittedStats(
  omittedFunctions: FunctionData[]
): FunctionListStats | null {
  if (omittedFunctions.length === 0) {
    return null;
  }

  const maxTotal = Math.max(...omittedFunctions.map((f) => f.total));
  const maxSelf = Math.max(...omittedFunctions.map((f) => f.self));
  const sumSelf = omittedFunctions.reduce((sum, f) => sum + f.self, 0);

  return {
    omittedCount: omittedFunctions.length,
    maxTotal,
    maxSelf,
    sumSelf,
  };
}

/**
 * Format a list of functions with a limit, showing statistics for omitted entries.
 */
export function formatFunctionList(
  title: string,
  functions: FunctionData[],
  limit: number,
  sortKey: 'total' | 'self',
  threadIndexes: Set<ThreadIndex>,
  functionMap: FunctionMap
): FormattedFunctionList {
  const displayedFunctions = functions.slice(0, limit);
  const omittedFunctions = functions.slice(limit);

  const lines = displayedFunctions.map((func) =>
    formatFunctionEntry(func, sortKey, threadIndexes, functionMap)
  );

  const stats = computeOmittedStats(omittedFunctions);

  if (stats) {
    lines.push('');
    lines.push(
      `  ... (${stats.omittedCount} more functions omitted, ` +
        `max total: ${Math.round(stats.maxTotal)}, ` +
        `max self: ${Math.round(stats.maxSelf)}, ` +
        `sum of self: ${Math.round(stats.sumSelf)})`
    );
  }

  return {
    title,
    lines,
    stats,
  };
}

/**
 * Create both top function lists (by total and by self).
 */
export function createTopFunctionLists(
  functions: FunctionData[],
  limit: number,
  threadIndexes: Set<ThreadIndex>,
  functionMap: FunctionMap
): { byTotal: FormattedFunctionList; bySelf: FormattedFunctionList } {
  const byTotal = formatFunctionList(
    'Top Functions (by total time)',
    sortByTotal(functions),
    limit,
    'total',
    threadIndexes,
    functionMap
  );

  const bySelf = formatFunctionList(
    'Top Functions (by self time)',
    sortBySelf(functions),
    limit,
    'self',
    threadIndexes,
    functionMap
  );

  return { byTotal, bySelf };
}
