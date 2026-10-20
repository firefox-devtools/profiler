/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from 'firefox-profiler/utils/special-paths';
import { SetCollectionBuilder } from 'firefox-profiler/utils/set-collection';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { getOriginalSourceForFrame } from 'firefox-profiler/profile-logic/profile-data';

import { FrameFlag, FuncFlag } from 'firefox-profiler/types';
import type {
  IndexIntoFuncTable,
  IndexIntoSourceLocationTable,
  IndexIntoSourceTable,
  Profile,
  SourceCodeAvailability,
  SourceCodeContents,
  SourceCodeSharingCandidate,
  SourceCodeSharingFile,
  SourceCodeSharingStats,
  SourceCodeSharingSummary,
  SourceCodeStatus,
  SourceFileTreeNode,
  ThreadIndex,
} from 'firefox-profiler/types';

// Files that anybody can download don't need to be embedded, the profiler
// fetches them again when the shared profile is opened.
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
): Map<IndexIntoSourceTable, SourceCodeContents> {
  const contents = new Map<IndexIntoSourceTable, SourceCodeContents>();
  const { sources } = profile.shared;

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const code = sources.content[sourceIndex];
    if (code !== null) {
      contents.set(sourceIndex, { code, origin: 'PROFILE' });
    }
  }

  for (const [sourceIndex, status] of sourceCodeCache) {
    if (status.type !== 'AVAILABLE' || contents.has(sourceIndex)) {
      continue;
    }
    if (sourceIndex < 0 || sourceIndex >= sources.length) {
      continue;
    }
    contents.set(sourceIndex, { code: status.code, origin: status.origin });
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

/**
 * The tree segments for a file. `bundleUrl` is set for files that a source
 * map produced, and is the URL of the generated file they were mapped from.
 */
function _pathSegmentsForFilename(
  path: string,
  productName: string,
  bundleUrl: string | null
): string[] {
  // Files inside the browser's omni.ja archive, which is the packaged form of
  // the chrome:// and resource:// files. The install path in front of it is
  // noise.
  const omniJarMatch = /^jar:.*\bomni\.ja!(\/.*)$/i.exec(path);
  if (omniJarMatch !== null) {
    return [productName, 'omni.ja', ..._splitPath(omniJarMatch[1])];
  }

  let segments;
  let isWebUrl = false;
  const originMatch = URL_ORIGIN_REGEX.exec(path);
  if (originMatch !== null) {
    const [, scheme, host, rest] = originMatch;
    if (INTERNAL_URL_SCHEMES.has(scheme.toLowerCase())) {
      return [productName, `${scheme}://${host}`, ..._splitPath(rest ?? '')];
    }
    segments = [`${scheme}://${host}`, ..._splitPath(rest ?? '')];
    isWebUrl = /^https?$/i.test(scheme) && host !== '';
  } else {
    segments = path.split(/[/\\]/).filter((s) => s !== '');
    if (segments.length === 0) {
      segments = [path];
    }
  }

  // Source maps name their files in all sorts of ways: relative to the
  // bundle, with a webpack:// scheme, or as paths on the build machine. None
  // of those say which site the code ran on, so they go under the site that
  // served the bundle, as they are.
  const bundleOrigin = _siteOrigin(bundleUrl);
  return bundleOrigin !== null && !isWebUrl
    ? [bundleOrigin, ...segments]
    : segments;
}

// "<scheme>://<host>" for URLs with a host, which is what tells sites apart.
function _siteOrigin(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  const match = URL_ORIGIN_REGEX.exec(url);
  return match !== null && match[2] !== '' ? `${match[1]}://${match[2]}` : null;
}

/**
 * For each file that a source map produced, the generated file it was mapped
 * from. Original files are only reachable through funcs and frames, so this
 * is a pass over both tables.
 */
function _computeOriginalToGeneratedSource(
  profile: Profile
): Map<IndexIntoSourceTable, IndexIntoSourceTable> {
  const { funcTable, frameTable, sourceLocationTable } = profile.shared;
  const originalToGenerated = new Map<
    IndexIntoSourceTable,
    IndexIntoSourceTable
  >();
  if (sourceLocationTable === null) {
    return originalToGenerated;
  }
  const record = (
    locationIndex: IndexIntoSourceLocationTable,
    funcIndex: IndexIntoFuncTable
  ) => {
    if ((funcTable.flags[funcIndex] & FuncFlag.HasSource) === 0) {
      return;
    }
    const original = sourceLocationTable.source[locationIndex];
    if (!originalToGenerated.has(original)) {
      originalToGenerated.set(original, funcTable.source[funcIndex]);
    }
  };
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    if ((funcTable.flags[funcIndex] & FuncFlag.HasOriginalLocation) !== 0) {
      record(funcTable.originalLocation[funcIndex], funcIndex);
    }
  }
  for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
    if ((frameTable.flags[frameIndex] & FrameFlag.HasOriginalLocation) !== 0) {
      record(
        frameTable.originalLocation[frameIndex],
        frameTable.func[frameIndex]
      );
    }
  }
  return originalToGenerated;
}

/**
 * The source of each stack's own frame, or -1 when it has none. Source-mapped
 * frames resolve to their original file.
 */
export function computeStackToSource(profile: Profile): Int32Array {
  const { stackTable, frameTable, funcTable, sourceLocationTable } =
    profile.shared;
  const stackToSource = new Int32Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const frameIndex = stackTable.frame[stackIndex];
    const source = getOriginalSourceForFrame(
      frameIndex,
      frameTable.func[frameIndex],
      frameTable,
      funcTable,
      sourceLocationTable
    );
    stackToSource[stackIndex] = source ?? -1;
  }

  return stackToSource;
}

/**
 * The pickable source files anywhere on the given threads' stacks, not only in
 * the leaf frames.
 */
export function computeSourcesForThreads(
  profile: Profile,
  threadIndexes: ReadonlySet<ThreadIndex>,
  stackToSource: Int32Array,
  pickableSources: ReadonlySet<IndexIntoSourceTable>
): Set<IndexIntoSourceTable> {
  const sources = new Set<IndexIntoSourceTable>();
  if (threadIndexes.size === 0 || pickableSources.size === 0) {
    return sources;
  }

  const { stackTable } = profile.shared;
  // Mark the sampled stacks, then propagate the marks to their prefixes.
  const isOnAStack = new Uint8Array(stackTable.length);
  for (const threadIndex of threadIndexes) {
    const thread = profile.threads[threadIndex];
    if (thread === undefined) {
      // A thread index left over from a profile that has since been replaced.
      continue;
    }
    const { samples } = thread;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      const stackIndex = samples.stack[sampleIndex];
      if (stackIndex !== null) {
        isOnAStack[stackIndex] = 1;
      }
    }
  }

  // A stack's prefix always has a lower index than the stack itself, so one
  // reverse pass reaches every ancestor.
  for (let stackIndex = stackTable.length - 1; stackIndex >= 0; stackIndex--) {
    if (isOnAStack[stackIndex] === 0) {
      continue;
    }
    const prefixOffset = stackTable.prefixOffset[stackIndex];
    if (prefixOffset !== 0) {
      isOnAStack[stackIndex - prefixOffset] = 1;
    }
    const source = stackToSource[stackIndex];
    if (source !== -1 && pickableSources.has(source)) {
      sources.add(source);
    }
  }

  return sources;
}

/**
 * The total (not self) sample weight of each source across all threads,
 * counting a source once per stack even if it appears several times. Only
 * meaningful relative to each other. Sources which are never on a sampled
 * stack are absent.
 */
function _computeSourceTotalWeights(
  profile: Profile,
  stackToSource: Int32Array
): Map<IndexIntoSourceTable, number> {
  const { stackTable } = profile.shared;

  // For each stack, the set of sources on its path to the root, as an index
  // into a trie of sets. -1 means there are none.
  const builder = new SetCollectionBuilder<IndexIntoSourceTable>();
  const stackToSourceSet = new Int32Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixOffset = stackTable.prefixOffset[stackIndex];
    const prefixSet =
      prefixOffset !== 0 ? stackToSourceSet[stackIndex - prefixOffset] : -1;

    const source = stackToSource[stackIndex];
    if (source === -1) {
      stackToSourceSet[stackIndex] = prefixSet;
      continue;
    }
    stackToSourceSet[stackIndex] = builder.extend(
      prefixSet !== -1 ? prefixSet : null,
      source
    );
  }

  const setTable = builder.finish();

  const weightPerSet = new Float64Array(setTable.length);
  for (const { samples } of profile.threads) {
    const { stack, weight } = samples;
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      const stackIndex = stack[sampleIndex];
      if (stackIndex === null) {
        continue;
      }
      const setIndex = stackToSourceSet[stackIndex];
      if (setIndex === -1) {
        continue;
      }
      // Weights are negative in comparison profiles.
      weightPerSet[setIndex] +=
        weight !== null ? Math.abs(weight[sampleIndex]) : 1;
    }
  }

  // Push each set's weight up to its parent, so that every entry ends up with
  // the weight of all the sets containing its value. Parents have lower
  // indexes, so one reverse pass is enough.
  for (let i = setTable.length - 1; i >= 0; i--) {
    const parent = setTable.parent[i];
    if (parent !== null) {
      weightPerSet[parent] += weightPerSet[i];
    }
  }

  const totals = new Map<IndexIntoSourceTable, number>();
  for (let i = 0; i < setTable.length; i++) {
    if (weightPerSet[i] === 0) {
      continue;
    }
    const source = setTable.value[i];
    totals.set(source, (totals.get(source) ?? 0) + weightPerSet[i]);
  }

  return totals;
}

/**
 * Every source file that is on a sampled stack, ordered by the time spent in
 * it, most first. This depends on the profile only, so it's computed once.
 */
export function computeSourceCodeSharingCandidates(
  profile: Profile,
  stackToSource: Int32Array
): SourceCodeSharingCandidate[] {
  const { sources, stringArray } = profile.shared;
  const productName = profile.meta.product || 'Firefox';
  const totalWeights = _computeSourceTotalWeights(profile, stackToSource);
  const originalToGenerated = _computeOriginalToGeneratedSource(profile);

  const candidates = Array.from(totalWeights.keys(), (sourceIndex) => {
    const filename = stringArray[sources.filename[sourceIndex]];
    const path = parseFileNameFromSymbolication(filename).path;
    const generated = originalToGenerated.get(sourceIndex);
    const bundleUrl =
      generated !== undefined
        ? parseFileNameFromSymbolication(
            stringArray[sources.filename[generated]]
          ).path
        : null;
    return {
      sourceIndex,
      path,
      pathSegments: _pathSegmentsForFilename(path, productName, bundleUrl),
      isPubliclyDownloadable: _isPubliclyDownloadable(filename),
    };
  });

  candidates.sort((a, b) => {
    const weightDifference =
      (totalWeights.get(b.sourceIndex) ?? 0) -
      (totalWeights.get(a.sourceIndex) ?? 0);
    if (weightDifference !== 0) {
      return weightDifference;
    }
    return a.path.localeCompare(b.path);
  });

  return candidates;
}

/**
 * The files worth offering in the publish panel: downloaded ones first, then
 * the rest, each in candidate order. Files that anybody can download are left
 * out, unless their contents came from the user's own machine, in which case
 * the public URL may well not work.
 */
export function computeSourceCodeSharingFiles(
  candidates: SourceCodeSharingCandidate[],
  contents: Map<IndexIntoSourceTable, SourceCodeContents>
): SourceCodeSharingFile[] {
  const byAvailability: Record<
    SourceCodeAvailability,
    SourceCodeSharingFile[]
  > = { DOWNLOADED: [], UNAVAILABLE: [] };
  for (const candidate of candidates) {
    const { sourceIndex } = candidate;
    const fileContents = contents.get(sourceIndex);
    if (candidate.isPubliclyDownloadable && fileContents?.origin !== 'LOCAL') {
      continue;
    }
    const availability: SourceCodeAvailability =
      fileContents !== undefined ? 'DOWNLOADED' : 'UNAVAILABLE';
    byAvailability[availability].push({
      sourceIndex,
      path: candidate.path,
      pathSegments: candidate.pathSegments,
      availability,
      byteCount: fileContents !== undefined ? fileContents.code.length : null,
    });
  }
  return [...byAvailability.DOWNLOADED, ...byAvailability.UNAVAILABLE];
}

export function computeSourceCodeSharingStats(
  candidates: SourceCodeSharingCandidate[],
  files: SourceCodeSharingFile[]
): SourceCodeSharingStats {
  let downloadedFileCount = 0;
  let downloadedByteCount = 0;
  let unavailableFileCount = 0;
  for (const file of files) {
    switch (file.availability) {
      case 'DOWNLOADED':
        downloadedFileCount++;
        downloadedByteCount += file.byteCount ?? 0;
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
    downloadedByteCount,
    unavailableFileCount,
    publiclyDownloadableFileCount: candidates.length - files.length,
  };
}

/**
 * The files the user can pick, which are the downloaded ones.
 */
export function computePickableSources(
  files: SourceCodeSharingFile[]
): Set<IndexIntoSourceTable> {
  const pickable = new Set<IndexIntoSourceTable>();
  for (const file of files) {
    if (file.availability === 'DOWNLOADED') {
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

/**
 * Turn the flat file list into a tree. Children keep the order of `files`, so
 * the directories holding downloaded files come first, heaviest first.
 */
export function buildSourceFileTree(
  files: SourceCodeSharingFile[]
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

  return Array.from(root.children.values(), (child) =>
    _finishTreeNode(child, '')
  );
}

function _finishTreeNode(
  startNode: PartialTreeNode,
  parentPath: string
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
  // File rows show the file's real path, which the tree path can differ from:
  // it drops the leading "/" and adds the group root for internal URLs.
  const path = node.files.length > 0 ? node.files[0].path : treePath;
  const children = Array.from(node.children.values(), (child) =>
    _finishTreeNode(child, treePath)
  );

  const sourceIndexes = [];
  let byteCount = 0;
  let downloadedFileCount = 0;
  for (const file of node.files) {
    switch (file.availability) {
      case 'DOWNLOADED':
        sourceIndexes.push(file.sourceIndex);
        byteCount += file.byteCount ?? 0;
        downloadedFileCount++;
        break;
      case 'UNAVAILABLE':
        break;
      default:
        throw assertExhaustiveCheck(file.availability);
    }
  }
  for (const child of children) {
    sourceIndexes.push(...child.sourceIndexes);
    byteCount += child.byteCount;
    downloadedFileCount += child.downloadedFileCount;
  }

  return {
    key: treePath,
    label,
    path,
    availability: node.files.length > 0 ? node.files[0].availability : null,
    sourceIndexes,
    byteCount,
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
  contents: Map<IndexIntoSourceTable, SourceCodeContents>,
  selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>
): Profile {
  const { sources } = profile.shared;
  const content = sources.content.slice();
  let changed = false;

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    const newContent = selectedSourceIndexes.has(sourceIndex)
      ? (contents.get(sourceIndex)?.code ?? null)
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
  contents: Map<IndexIntoSourceTable, SourceCodeContents>,
  selectedSourceIndexes: ReadonlySet<IndexIntoSourceTable>
): SourceCodeSharingSummary {
  let fileCount = 0;
  let byteCount = 0;
  for (const sourceIndex of selectedSourceIndexes) {
    const fileContents = contents.get(sourceIndex);
    if (fileContents !== undefined) {
      fileCount++;
      byteCount += fileContents.code.length;
    }
  }
  return { fileCount, byteCount };
}
