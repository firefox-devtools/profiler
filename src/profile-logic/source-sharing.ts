/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from 'firefox-profiler/utils/special-paths';
import {
  assertExhaustiveCheck,
  ensureExists,
} from 'firefox-profiler/utils/types';
import { checkBit, makeBitSet, setBit } from 'firefox-profiler/utils/bitset';

import { FuncFlag } from 'firefox-profiler/types';
import type {
  IndexIntoCategoryList,
  IndexIntoFuncTable,
  IndexIntoSourceTable,
  IndexIntoStackTable,
  Profile,
  RawFuncTable,
  RawThread,
  SourceCodeAvailability,
  SourceCodeSharingCandidate,
  SourceCodeSharingFile,
  SourceCodeSharingStats,
  SourceCodeSharingSummary,
  SourceCodeStatus,
  SourceFileTreeNode,
  SourceLocationTable,
  StackTable,
  ThreadIndex,
} from 'firefox-profiler/types';

// Files with a public download URL can be fetched from anywhere, without the
// browser connection or a local symbol server.
function _isPubliclyDownloadable(filename: string): boolean {
  const recipe = getDownloadRecipeForSourceFile(
    parseFileNameFromSymbolication(filename)
  );
  return recipe.type !== 'NO_KNOWN_CORS_URL';
}

/**
 * The source contents we have on hand, from the profile or fetched during this
 * session, by source index. The profile's own contents win over the cache.
 */
export function computeSourceContentsForSharing(
  profile: Profile,
  sourceCodeCache: Map<IndexIntoSourceTable, SourceCodeStatus>
): Map<IndexIntoSourceTable, string> {
  const contents = new Map<IndexIntoSourceTable, string>();
  const { sources } = profile.shared;

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const code = sources.content[sourceIndex];
    if (code !== null) {
      contents.set(sourceIndex, code);
    }
  }

  for (const [sourceIndex, status] of sourceCodeCache) {
    if (status.type !== 'AVAILABLE' || contents.has(sourceIndex)) {
      continue;
    }
    contents.set(sourceIndex, status.code);
  }

  return contents;
}

// The URL schemes for files that ship inside the browser. They get a common
// root in the tree, named after the product, rather than one root per scheme.
const INTERNAL_URL_SCHEMES = new Set(['chrome', 'resource', 'moz-src']);

function _splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

// URLs keep "<scheme>://<host>" in one segment, so that the "//" doesn't turn
// into empty rows.
const URL_ORIGIN_REGEX = /^([a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)?$/i;

// The tree segments for a file.
function _pathSegmentsForFilename(path: string, productName: string): string[] {
  // Files inside the browser's omni.ja archive, which is the packaged form of
  // the chrome:// and resource:// files. The install path in front of it is
  // noise.
  const omniJarMatch = /^jar:.*\bomni\.ja!(\/.*)$/i.exec(path);
  if (omniJarMatch !== null) {
    return [productName, 'omni.ja', ..._splitPath(omniJarMatch[1])];
  }

  const originMatch = URL_ORIGIN_REGEX.exec(path);
  if (originMatch !== null) {
    const [, scheme, host, rest] = originMatch;
    if (INTERNAL_URL_SCHEMES.has(scheme.toLowerCase())) {
      return [productName, `${scheme}://${host}`, ..._splitPath(rest ?? '')];
    }
    return [`${scheme}://${host}`, ..._splitPath(rest ?? '')];
  }

  const segments = path.split(/[/\\]/).filter((s) => s !== '');
  return segments.length > 0 ? segments : [path];
}

// The source a func opens in the source view: its original file when it is
// source-mapped, otherwise its own file, or -1 when it has none.
function _getFuncSource(
  funcTable: RawFuncTable,
  sourceLocationTable: SourceLocationTable,
  funcIndex: IndexIntoFuncTable
): IndexIntoSourceTable | -1 {
  const flags = funcTable.flags[funcIndex];
  if ((flags & FuncFlag.HasOriginalLocation) !== 0) {
    return sourceLocationTable.source[funcTable.originalLocation[funcIndex]];
  }
  if ((flags & FuncFlag.HasSource) !== 0) {
    return funcTable.source[funcIndex];
  }
  return -1;
}

// The sources of the funcs anywhere on the threads' sample and allocation
// stacks, not only in the leaf frames. Source-mapped funcs count for both their
// original file and their bundle.
function _computeSourcesOnStacks(
  profile: Profile,
  threads: RawThread[]
): Set<IndexIntoSourceTable> {
  const { stackTable, frameTable, funcTable, sourceLocationTable } =
    profile.shared;
  // Mark the stacks in use, then propagate the marks to their prefixes.
  const isOnAStack = makeBitSet(stackTable.length);
  const markStacks = (stacks: Array<IndexIntoStackTable | null>) => {
    for (const stackIndex of stacks) {
      if (stackIndex !== null) {
        setBit(isOnAStack, stackIndex);
      }
    }
  };
  for (const { samples, jsAllocations, nativeAllocations } of threads) {
    markStacks(samples.stack);
    // Allocation-only profiles, like DHAT imports, have no samples.
    if (jsAllocations) {
      markStacks(jsAllocations.stack);
    }
    if (nativeAllocations) {
      markStacks(nativeAllocations.stack);
    }
  }

  const isOnAStackFunc = makeBitSet(funcTable.length);
  // A stack's prefix always has a lower index than the stack itself, so one
  // reverse pass reaches every ancestor.
  for (let stackIndex = stackTable.length - 1; stackIndex >= 0; stackIndex--) {
    if (!checkBit(isOnAStack, stackIndex)) {
      continue;
    }
    const prefixOffset = stackTable.prefixOffset[stackIndex];
    if (prefixOffset !== 0) {
      setBit(isOnAStack, stackIndex - prefixOffset);
    }
    setBit(isOnAStackFunc, frameTable.func[stackTable.frame[stackIndex]]);
  }

  const sources = new Set<IndexIntoSourceTable>();
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    if (!checkBit(isOnAStackFunc, funcIndex)) {
      continue;
    }
    const flags = funcTable.flags[funcIndex];
    if ((flags & FuncFlag.HasSource) !== 0) {
      sources.add(funcTable.source[funcIndex]);
    }
    if ((flags & FuncFlag.HasOriginalLocation) !== 0) {
      sources.add(
        sourceLocationTable.source[funcTable.originalLocation[funcIndex]]
      );
    }
  }
  return sources;
}

/**
 * The pickable source files anywhere on the given threads' stacks, not only in
 * the leaf frames.
 */
export function computeSourcesForThreads(
  profile: Profile,
  threadIndexes: ReadonlySet<ThreadIndex>,
  pickableSources: ReadonlySet<IndexIntoSourceTable>
): Set<IndexIntoSourceTable> {
  const sources = new Set<IndexIntoSourceTable>();
  if (threadIndexes.size === 0 || pickableSources.size === 0) {
    return sources;
  }

  const threads = Array.from(threadIndexes, (threadIndex) =>
    ensureExists(
      profile.threads[threadIndex],
      'The selected thread index is out of range.'
    )
  );

  const sourcesOnStacks = _computeSourcesOnStacks(profile, threads);
  for (const source of sourcesOnStacks) {
    if (pickableSources.has(source)) {
      sources.add(source);
    }
  }
  return sources;
}

/**
 * Every source file that is on a sample or allocation stack. This depends on
 * the profile only, so it's computed once.
 */
export function computeSourceCodeSharingCandidates(
  profile: Profile
): SourceCodeSharingCandidate[] {
  const { sources, stringArray } = profile.shared;
  const productName = profile.meta.product || 'Firefox';
  const sourcesOnStacks = _computeSourcesOnStacks(profile, profile.threads);

  const sourceIndexes = Array.from(sourcesOnStacks).sort((a, b) => a - b);
  return sourceIndexes.map((sourceIndex) => {
    const filename = stringArray[sources.filename[sourceIndex]];
    const path = parseFileNameFromSymbolication(filename).path;
    return {
      sourceIndex,
      path,
      pathSegments: _pathSegmentsForFilename(path, productName),
      isPubliclyDownloadable: _isPubliclyDownloadable(filename),
    };
  });
}

/**
 * The weight of each root of the file tree, by its segment, which orders the
 * roots. A sample counts for the innermost func that has a source file, and
 * idle samples don't count, so that the roots where the profile spends its
 * time come first.
 */
export function computeSourceTreeRootWeights(
  profile: Profile,
  stackTable: StackTable,
  candidates: SourceCodeSharingCandidate[],
  idleCategory: IndexIntoCategoryList | null
): Map<string, number> {
  const sourceToRoot = new Map<IndexIntoSourceTable, string>();
  for (const { sourceIndex, pathSegments } of candidates) {
    sourceToRoot.set(sourceIndex, pathSegments[0]);
  }

  const { frameTable, funcTable, sourceLocationTable } = profile.shared;
  const funcToSource = new Int32Array(funcTable.length);
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    funcToSource[funcIndex] = _getFuncSource(
      funcTable,
      sourceLocationTable,
      funcIndex
    );
  }

  const rootWeights = new Map<string, number>();
  for (const { samples } of profile.threads) {
    const { stack, weight } = samples;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      const stackIndex = stack[sampleIndex];
      if (
        stackIndex === null ||
        stackTable.category[stackIndex] === idleCategory
      ) {
        continue;
      }
      // Walk up to the innermost func that has a source. That's usually the
      // leaf, so this is cheaper than resolving every stack up front.
      let selfStack = stackIndex;
      let source = funcToSource[frameTable.func[stackTable.frame[selfStack]]];
      while (source === -1 && stackTable.prefix[selfStack] !== -1) {
        selfStack = stackTable.prefix[selfStack];
        source = funcToSource[frameTable.func[stackTable.frame[selfStack]]];
      }
      const root = sourceToRoot.get(source);
      if (root === undefined) {
        continue;
      }
      // Weights are negative in comparison profiles.
      const sampleWeight = weight !== null ? Math.abs(weight[sampleIndex]) : 1;
      rootWeights.set(root, (rootWeights.get(root) ?? 0) + sampleWeight);
    }
  }
  return rootWeights;
}

/**
 * The files worth offering in the publish panel, in candidate order.
 */
export function computeSourceCodeSharingFiles(
  candidates: SourceCodeSharingCandidate[],
  contents: Map<IndexIntoSourceTable, string>
): SourceCodeSharingFile[] {
  return candidates.map((candidate) => {
    const fileContents = contents.get(candidate.sourceIndex);
    return {
      sourceIndex: candidate.sourceIndex,
      path: candidate.path,
      pathSegments: candidate.pathSegments,
      availability: fileContents !== undefined ? 'DOWNLOADED' : 'UNAVAILABLE',
      uncompressedSize: fileContents !== undefined ? fileContents.length : null,
    };
  });
}

export function computeSourceCodeSharingStats(
  files: SourceCodeSharingFile[]
): SourceCodeSharingStats {
  let downloadedFileCount = 0;
  let downloadedUncompressedSize = 0;
  let unavailableFileCount = 0;
  for (const file of files) {
    switch (file.availability) {
      case 'DOWNLOADED':
        downloadedFileCount++;
        downloadedUncompressedSize += file.uncompressedSize ?? 0;
        break;
      case 'UNAVAILABLE':
        unavailableFileCount++;
        break;
      default:
        throw assertExhaustiveCheck(file.availability);
    }
  }
  return {
    fileCount: files.length,
    downloadedFileCount,
    downloadedUncompressedSize,
    unavailableFileCount,
  };
}

function _isPickable(availability: SourceCodeAvailability): boolean {
  switch (availability) {
    case 'DOWNLOADED':
      return true;
    case 'UNAVAILABLE':
      return false;
    default:
      throw assertExhaustiveCheck(availability);
  }
}

/**
 * The files the user can pick, which are the downloaded ones.
 */
export function computePickableSources(
  files: SourceCodeSharingFile[]
): Set<IndexIntoSourceTable> {
  const pickable = new Set<IndexIntoSourceTable>();
  for (const file of files) {
    if (_isPickable(file.availability)) {
      pickable.add(file.sourceIndex);
    }
  }
  return pickable;
}

// A directory or file while the tree is still being built.
type PartialTreeNode = {
  segment: string;
  children: Map<string, PartialTreeNode>;
  // Gecko keys sources by a hash of path and contents, so one path can stand
  // for several sources, like a script that changed between page loads.
  files: SourceCodeSharingFile[];
};

function _newPartialTreeNode(segment: string): PartialTreeNode {
  return { segment, children: new Map(), files: [] };
}

// Every pickable source index in the tree, in one buffer. Each row writes its
// own indexes and then its children's, so that the indexes at or below a row
// are a contiguous range, which the row gets as a view instead of a copy.
type TreeSourceIndexes = {
  buffer: Int32Array;
  length: number;
};

/**
 * Turn the flat file list into a tree. The roots are ordered by `rootWeights`,
 * heaviest first. Below them, rows are in alphabetical order, directories
 * first, so that they stay put while files get downloaded.
 */
export function buildSourceFileTree(
  files: SourceCodeSharingFile[],
  rootWeights: Map<string, number>
): SourceFileTreeNode[] {
  const root = _newPartialTreeNode('');
  for (const file of files) {
    let node = root;
    for (const segment of file.pathSegments) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = _newPartialTreeNode(segment);
        node.children.set(segment, child);
      }
      node = child;
    }
    node.files.push(file);
  }

  let pickableCount = 0;
  for (const file of files) {
    if (_isPickable(file.availability)) {
      pickableCount++;
    }
  }
  const sourceIndexes = {
    buffer: new Int32Array(pickableCount),
    length: 0,
  };

  const roots = Array.from(root.children.values(), (child) => ({
    weight: rootWeights.get(child.segment) ?? 0,
    node: _finishTreeNode(child, '', sourceIndexes),
  }));
  roots.sort((a, b) => b.weight - a.weight || _compareTreeRows(a.node, b.node));
  return roots.map(({ node }) => node);
}

const _rowNameCollator = new Intl.Collator('en', { numeric: true });

function _compareTreeRows(a: SourceFileTreeNode, b: SourceFileTreeNode) {
  const aIsDirectory = a.children.length > 0;
  const bIsDirectory = b.children.length > 0;
  if (aIsDirectory !== bIsDirectory) {
    return aIsDirectory ? -1 : 1;
  }
  return _rowNameCollator.compare(a.label, b.label);
}

// Lower is better. A row whose path has several sources shows the best
// availability among them.
function _availabilityRank(availability: SourceCodeAvailability): number {
  switch (availability) {
    case 'DOWNLOADED':
      return 0;
    case 'UNAVAILABLE':
      return 1;
    default:
      throw assertExhaustiveCheck(availability);
  }
}

function _finishTreeNode(
  startNode: PartialTreeNode,
  parentPath: string,
  sourceIndexes: TreeSourceIndexes
): SourceFileTreeNode {
  // Collapse chains of only children into a single row.
  const segments = [startNode.segment];
  let node = startNode;
  while (node.files.length === 0 && node.children.size === 1) {
    node = node.children.values().next().value as PartialTreeNode;
    segments.push(node.segment);
  }

  const label = segments.join('/');
  const treePath = parentPath === '' ? label : `${parentPath}/${label}`;

  let files = node.files;
  let fileRowNode: PartialTreeNode | null = null;
  if (files.length > 0 && node.children.size > 0) {
    // A path that is both a file and a directory, like a page with inline
    // scripts and the scripts below it, gets a file row in its directory row,
    // so that the file can be picked on its own.
    fileRowNode = { segment: node.segment, children: new Map(), files };
    files = [];
  }
  // File rows show the file's real path, which the tree path can differ from:
  // it drops the leading "/" and adds the group root for internal URLs.
  const path = files.length > 0 ? files[0].path : treePath;

  const start = sourceIndexes.length;
  let availability: SourceCodeAvailability | null = null;
  let uncompressedSize = 0;
  let downloadedFileCount = 0;
  for (const file of files) {
    if (
      availability === null ||
      _availabilityRank(file.availability) < _availabilityRank(availability)
    ) {
      availability = file.availability;
    }
    if (_isPickable(file.availability)) {
      sourceIndexes.buffer[sourceIndexes.length++] = file.sourceIndex;
    }
    switch (file.availability) {
      case 'DOWNLOADED':
        uncompressedSize += file.uncompressedSize ?? 0;
        downloadedFileCount++;
        break;
      case 'UNAVAILABLE':
        break;
      default:
        throw assertExhaustiveCheck(file.availability);
    }
  }

  const children = Array.from(node.children.values(), (child) =>
    _finishTreeNode(child, treePath, sourceIndexes)
  );
  if (fileRowNode !== null) {
    children.push({
      ..._finishTreeNode(fileRowNode, treePath, sourceIndexes),
      // A child can have the same name as the file row, but no other key ends
      // with "/".
      key: `${treePath}/`,
    });
  }
  children.sort(_compareTreeRows);
  for (const child of children) {
    uncompressedSize += child.uncompressedSize;
    downloadedFileCount += child.downloadedFileCount;
  }

  return {
    key: treePath,
    label,
    path,
    availability,
    sourceIndexes: sourceIndexes.buffer.subarray(start, sourceIndexes.length),
    uncompressedSize,
    downloadedFileCount,
    children,
  };
}

/**
 * Return a copy of the profile carrying the contents of the selected files and
 * nothing else, including dropping unselected contents that were already
 * embedded. Returns the profile itself if nothing changes.
 */
export function setSharedSourceCode(
  profile: Profile,
  contents: Map<IndexIntoSourceTable, string>,
  selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>
): Profile {
  const { sources } = profile.shared;
  const content = sources.content.slice();
  let changed = false;

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const newContent = selectedSourceIndexes.has(sourceIndex)
      ? (contents.get(sourceIndex) ?? null)
      : null;
    if (content[sourceIndex] !== newContent) {
      content[sourceIndex] = newContent;
      changed = true;
    }
  }

  if (!changed) {
    return profile;
  }

  return {
    ...profile,
    shared: {
      ...profile.shared,
      sources: { ...sources, content },
    },
  };
}

export function computeSourceCodeSharingSummary(
  contents: Map<IndexIntoSourceTable, string>,
  selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>
): SourceCodeSharingSummary {
  let fileCount = 0;
  let uncompressedSize = 0;
  for (const sourceIndex of selectedSourceIndexes) {
    const fileContents = contents.get(sourceIndex);
    if (fileContents !== undefined) {
      fileCount++;
      uncompressedSize += fileContents.length;
    }
  }
  return { fileCount, uncompressedSize };
}
