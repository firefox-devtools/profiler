/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Show what a benchmark bucket's samples were doing in native code.
 *
 * The benchmark comparison assigns each sample to the deepest frame that is JS
 * or relevantForJS (a DOM binding or an inserted label). Everything below that
 * frame is invisible in the JS-only view: it shows up as the bucket's self
 * time. This tool prints the native call tree below the bucket frame, for the
 * samples of one suite that land in one bucket. A large native subtree under a
 * plain JS function usually means a label is missing or doesn't match.
 *
 *   yarn build-node-tools
 *   node node-tools-dist/bucket-native-tree.js --input profile.jslb \
 *     --suite Timeline-Mithril --bucket updateStyle
 *
 * Options:
 *   --suite <substring>   Suite to look at (case-insensitive substring).
 *   --bucket <name>       Bucket name (case-insensitive; exact match preferred,
 *                         otherwise a unique substring match).
 *   --depth <n>           Maximum native depth below the bucket frame (default 12).
 *   --min-share <f>       Hide nodes below this share of the bucket (default 0.01).
 *   --invert              Print a bottom-up tree (leaf functions first) instead.
 *   --list-buckets        List the suite's buckets by weight, with the share of
 *                         each bucket's weight that is in C++ code below the
 *                         bucket frame (JIT code and V8 builtins don't count).
 *   --limit <n>           Number of buckets for --list-buckets (default 40).
 *   --scan                Look at every suite instead of one (--suite is not
 *                         needed), and list the JS buckets whose self time
 *                         mostly enters one C++ function. These are candidates
 *                         for a missing label. The entry function is the first
 *                         frame below the bucket frame that isn't JIT code or a
 *                         V8 builtin.
 *   --min-bucket <f>      For --scan: ignore buckets below this share of their
 *                         suite (default 0.003).
 *   --min-entry <f>       For --scan: ignore entry functions below this share
 *                         of their bucket (default 0.1).
 *   --harness <name>      speedometer (default) or jetstream.
 */

import fs from 'fs';
import minimist from 'minimist';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import {
  computeIterationMarkersAndMeasuredSamples,
  computeSuiteFilteredSampleWeights,
  getBenchmarkInfo,
} from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import type {
  BenchmarkHarness,
  SamplesTableForThisStuff,
} from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import {
  correlateIPCMarkers,
  deriveMarkersFromRawMarkerTable,
} from 'firefox-profiler/profile-logic/marker-data';
import {
  computeTimeColumnForRawSamplesTable,
  getTimeRangeForThread,
} from 'firefox-profiler/profile-logic/profile-data';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { FuncFlag } from 'firefox-profiler/types/profile';
import type { IndexIntoFuncTable } from 'firefox-profiler/types/profile';

/**
 * A trie of native call paths below bucket frames. Node 0 is unused; each
 * bucket frame's native paths hang off a per-bucket root node whose func is the
 * bucket func.
 */
type PathTrie = {
  func: number[];
  parent: number[];
  depth: number[];
  /** "parentNode,func" -> child node */
  childMap: Map<string, number>;
};

function trieChild(trie: PathTrie, parent: number, func: number): number {
  const key = `${parent},${func}`;
  let node = trie.childMap.get(key);
  if (node === undefined) {
    node = trie.func.length;
    trie.func.push(func);
    trie.parent.push(parent);
    trie.depth.push(parent === -1 ? 0 : trie.depth[parent] + 1);
    trie.childMap.set(key, node);
  }
  return node;
}

function formatShare(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(1)}%`.padStart(6);
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['input', 'suite', 'bucket', 'harness'],
    boolean: ['invert', 'list-buckets', 'scan'],
  });
  if (
    !argv.input ||
    (!argv.scan && (!argv.suite || (!argv.bucket && !argv['list-buckets'])))
  ) {
    console.error(
      'Usage: bucket-native-tree --input <profile> --suite <name> ' +
        '(--bucket <name> [--invert] [--depth n] [--min-share f] | --list-buckets [--limit n])\n' +
        '       bucket-native-tree --input <profile> --scan [--min-bucket f] [--min-entry f]'
    );
    process.exit(1);
  }
  const maxDepth = Number(argv.depth ?? 12);
  const minShare = Number(argv['min-share'] ?? 0.01);
  const harness: BenchmarkHarness = argv.harness ?? 'speedometer';

  const bytes = fs.readFileSync(argv.input, null);
  const profile = await unserializeProfileOfArbitraryFormat(bytes.buffer);
  const benchmarkInfo = getBenchmarkInfo(profile, harness);
  const { shared } = profile;
  const thread = profile.threads[benchmarkInfo.threadIndex];
  const { funcTable, stackTable, frameTable, stringArray } = shared;
  const funcName = (f: number) =>
    f === -1 ? '(no JS frame)' : stringArray[funcTable.name[f]];

  // For each stack: the bucket func (deepest JS-relevant frame), and the trie
  // node of the native path below it. Direct recursion is collapsed, and paths
  // deeper than maxDepth are attributed to their ancestor at maxDepth.
  const trie: PathTrie = {
    func: [],
    parent: [],
    depth: [],
    childMap: new Map(),
  };
  const stackBucketFunc = new Int32Array(stackTable.length);
  const stackNode = new Int32Array(stackTable.length);
  // For --scan: the first frame below the bucket frame that is C++ code, as
  // opposed to JIT code (no resource, or a "JS JIT"-style resource) or a V8
  // builtin. -1 if none.
  const stackEntryFunc = new Int32Array(stackTable.length);
  const resourceName = (func: number) =>
    (funcTable.flags[func] & FuncFlag.HasResource) === 0
      ? '-'
      : stringArray[shared.resourceTable.name[funcTable.resource[func]]];
  const isJitCode = (func: number) =>
    (funcTable.flags[func] & FuncFlag.HasResource) === 0 ||
    resourceName(func).includes('JIT') ||
    stringArray[funcTable.name[func]].startsWith('Builtins_');
  for (let s = 0; s < stackTable.length; s++) {
    const func = frameTable.func[stackTable.frame[s]];
    const prefixOffset = stackTable.prefixOffset[s];
    const parent = prefixOffset !== 0 ? s - prefixOffset : -1;
    if (
      (funcTable.flags[func] & (FuncFlag.IsJS | FuncFlag.RelevantForJS)) !==
      0
    ) {
      stackBucketFunc[s] = func;
      stackNode[s] = trieChild(trie, -1, func);
      stackEntryFunc[s] = -1;
      continue;
    }
    const parentNode =
      parent !== -1 ? stackNode[parent] : trieChild(trie, -1, -1);
    stackBucketFunc[s] = parent !== -1 ? stackBucketFunc[parent] : -1;
    const parentEntry = parent !== -1 ? stackEntryFunc[parent] : -1;
    if (parentEntry !== -1) {
      stackEntryFunc[s] = parentEntry;
    } else {
      stackEntryFunc[s] = isJitCode(func) ? -1 : func;
    }
    if (trie.func[parentNode] === func || trie.depth[parentNode] >= maxDepth) {
      stackNode[s] = parentNode;
    } else {
      stackNode[s] = trieChild(trie, parentNode, func);
    }
  }

  // Bucket indexes in the same order as extract-benchmark-stats, so that the
  // "Profiling overhead" bucket can be ignored the same way.
  const sampleCount = thread.samples.length;
  const bucketFuncs: IndexIntoFuncTable[] = [];
  const funcToBucket = new Map<number, number>();
  const sampleBuckets = new Int32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const stack = thread.samples.stack[i];
    if (stack === null) {
      sampleBuckets[i] = -1;
      continue;
    }
    const func = stackBucketFunc[stack];
    let bucket = funcToBucket.get(func);
    if (bucket === undefined) {
      bucket = bucketFuncs.length;
      bucketFuncs.push(func);
      funcToBucket.set(func, bucket);
    }
    sampleBuckets[i] = bucket;
  }
  const overheadBucket = bucketFuncs.findIndex(
    (f) => f !== -1 && funcName(f) === 'Profiling overhead'
  );

  const { markers } = deriveMarkersFromRawMarkerTable(
    thread.markers,
    stringArray,
    thread.tid,
    getTimeRangeForThread(thread, profile.meta.interval),
    correlateIPCMarkers(profile.threads, shared)
  );
  const samples: SamplesTableForThisStuff = {
    length: sampleCount,
    time: new Float64Array(computeTimeColumnForRawSamplesTable(thread.samples)),
    weight: thread.samples.weight
      ? new Float64Array(thread.samples.weight)
      : new Float64Array(sampleCount).fill(1),
    bucketIndex: sampleBuckets,
    bucketCount: bucketFuncs.length,
  };
  const { markersPerSuite, measuredSamples } =
    computeIterationMarkersAndMeasuredSamples(
      benchmarkInfo,
      markers,
      samples,
      StringTable.withBackingArray(stringArray),
      overheadBucket !== -1 ? [overheadBucket] : []
    );
  if (argv.scan) {
    scan();
    return;
  }

  /**
   * For every suite, find the JS buckets whose self time mostly enters one C++
   * function, and print them sorted by the share of the suite they account for.
   */
  function scan() {
    const minBucket = Number(argv['min-bucket'] ?? 0.003);
    const minEntry = Number(argv['min-entry'] ?? 0.1);
    type Row = {
      suite: string;
      bucket: string;
      bucketShare: number;
      entry: string;
      entryShareOfBucket: number;
      entryShareOfSuite: number;
    };
    const rows: Row[] = [];
    for (const [suite, suiteMarkers] of markersPerSuite) {
      const w = computeSuiteFilteredSampleWeights(
        measuredSamples.weight,
        samples.time,
        suiteMarkers
      );
      let total = 0;
      const perBucket = new Float64Array(bucketFuncs.length);
      // "bucket,entry" -> weight
      const perEntry = new Map<string, number>();
      for (let i = 0; i < sampleCount; i++) {
        const stack = thread.samples.stack[i];
        if (w[i] === 0 || stack === null) {
          continue;
        }
        total += w[i];
        const b = sampleBuckets[i];
        perBucket[b] += w[i];
        const entry = stackEntryFunc[stack];
        if (entry !== -1) {
          const key = `${b},${entry}`;
          perEntry.set(key, (perEntry.get(key) ?? 0) + w[i]);
        }
      }
      for (const [key, weight] of perEntry) {
        const [b, entry] = key.split(',').map(Number);
        const func = bucketFuncs[b];
        if (func === -1 || (funcTable.flags[func] & FuncFlag.IsJS) === 0) {
          continue;
        }
        if (
          perBucket[b] < minBucket * total ||
          weight < minEntry * perBucket[b]
        ) {
          continue;
        }
        rows.push({
          suite,
          bucket: funcName(func),
          bucketShare: perBucket[b] / total,
          entry: `${funcName(entry)} [${resourceName(entry)}]`,
          entryShareOfBucket: weight / perBucket[b],
          entryShareOfSuite: weight / total,
        });
      }
    }
    rows.sort((a, b) => b.entryShareOfSuite - a.entryShareOfSuite);
    console.log(
      'suite%  = share of the suite that is in this bucket and enters this function'
    );
    console.log('bucket% = share of the bucket that enters this function');
    console.log(' suite%  bucket%  suite / bucket -> entry function');
    const pct = (x: number) => `${(x * 100).toFixed(2)}%`.padStart(7);
    for (const r of rows) {
      console.log(
        `${pct(r.entryShareOfSuite)}  ${pct(r.entryShareOfBucket)}  ` +
          `${r.suite} / ${r.bucket} (${pct(r.bucketShare).trim()}) -> ${r.entry}`
      );
    }
  }

  const suiteFilter = String(argv.suite).toLowerCase();
  const suiteEntry =
    markersPerSuite.find(([name]) => name.toLowerCase() === suiteFilter) ??
    markersPerSuite.find(([name]) => name.toLowerCase().includes(suiteFilter));
  if (suiteEntry === undefined) {
    throw new Error(
      `No suite matching "${argv.suite}". Suites: ${markersPerSuite.map(([n]) => n).join(', ')}`
    );
  }
  const [suiteName, iterationMarkers] = suiteEntry;
  const weights = computeSuiteFilteredSampleWeights(
    measuredSamples.weight,
    samples.time,
    iterationMarkers
  );

  const bucketTotals = new Float64Array(bucketFuncs.length);
  const bucketCpp = new Float64Array(bucketFuncs.length);
  let suiteTotal = 0;
  for (let i = 0; i < sampleCount; i++) {
    const w = weights[i];
    const stack = thread.samples.stack[i];
    if (w === 0 || stack === null) {
      continue;
    }
    bucketTotals[sampleBuckets[i]] += w;
    if (stackEntryFunc[stack] !== -1) {
      bucketCpp[sampleBuckets[i]] += w;
    }
    suiteTotal += w;
  }

  if (argv['list-buckets']) {
    const limit = Number(argv.limit ?? 40);
    const order = [...bucketTotals.keys()]
      .filter((b) => bucketTotals[b] > 0)
      .sort((a, b) => bucketTotals[b] - bucketTotals[a]);
    console.log(
      `${suiteName}: ${iterationMarkers.length} iterations, total weight ${suiteTotal.toFixed(0)}`
    );
    console.log(' weight  suite%    C++%  kind   bucket');
    for (const b of order.slice(0, limit)) {
      const f = bucketFuncs[b];
      let kind = '-';
      if (f !== -1) {
        kind = funcTable.flags[f] & FuncFlag.IsJS ? 'JS' : 'label';
      }
      console.log(
        `${bucketTotals[b].toFixed(0).padStart(7)}  ${formatShare(bucketTotals[b], suiteTotal)}  ` +
          `${formatShare(bucketCpp[b], bucketTotals[b])}   ${kind.padEnd(5)}  ${funcName(f)}`
      );
    }
    return;
  }

  const wanted = String(argv.bucket).toLowerCase();
  const present = bucketFuncs
    .map((_f, b) => b)
    .filter((b) => bucketTotals[b] > 0);
  let matches = present.filter(
    (b) => funcName(bucketFuncs[b]).toLowerCase() === wanted
  );
  if (matches.length === 0) {
    matches = present.filter((b) =>
      funcName(bucketFuncs[b]).toLowerCase().includes(wanted)
    );
  }
  if (matches.length !== 1) {
    const names = matches
      .slice(0, 20)
      .map((b) => `  ${funcName(bucketFuncs[b])}`)
      .join('\n');
    throw new Error(
      matches.length === 0
        ? `No bucket matching "${argv.bucket}" has weight in ${suiteName}.`
        : `"${argv.bucket}" matches ${matches.length} buckets:\n${names}`
    );
  }
  const bucket = matches[0];
  const bucketTotal = bucketTotals[bucket];
  const bucketFunc = bucketFuncs[bucket];

  // Accumulate self weight per trie node, for this bucket's samples only.
  const nodeSelf = new Float64Array(trie.func.length);
  for (let i = 0; i < sampleCount; i++) {
    const stack = thread.samples.stack[i];
    if (weights[i] === 0 || stack === null || sampleBuckets[i] !== bucket) {
      continue;
    }
    nodeSelf[stackNode[stack]] += weights[i];
  }

  console.log(
    `${suiteName}, bucket "${funcName(bucketFunc)}": weight ${bucketTotal.toFixed(0)}, ` +
      `${formatShare(bucketTotal, suiteTotal).trim()} of the suite, ` +
      `${formatShare(bucketCpp[bucket], bucketTotal).trim()} of it in C++ code below the bucket frame`
  );

  type TreeNode = {
    name: string;
    total: number;
    self: number;
    children: Map<string, TreeNode>;
  };
  const newNode = (name: string): TreeNode => ({
    name,
    total: 0,
    self: 0,
    children: new Map(),
  });
  const root = newNode(funcName(bucketFunc));
  for (let node = 0; node < trie.func.length; node++) {
    const w = nodeSelf[node];
    if (w === 0) {
      continue;
    }
    // Path from the bucket frame down to this node, excluding the bucket frame.
    const path: string[] = [];
    for (let n = node; trie.parent[n] !== -1; n = trie.parent[n]) {
      path.push(funcName(trie.func[n]));
    }
    if (!argv.invert) {
      path.reverse();
    }
    let current = root;
    current.total += w;
    for (const name of path) {
      let child = current.children.get(name);
      if (child === undefined) {
        child = newNode(name);
        current.children.set(name, child);
      }
      child.total += w;
      current = child;
    }
    current.self += w;
  }

  console.log(
    argv.invert
      ? ' total   self  native leaf function, then its callers up to the bucket frame'
      : ' total   self  native call tree below the bucket frame'
  );
  const threshold = minShare * bucketTotal;
  function print(node: TreeNode, indent: string) {
    console.log(
      `${formatShare(node.total, bucketTotal)} ${formatShare(node.self, bucketTotal)}  ${indent}${node.name}`
    );
    const children = [...node.children.values()].sort(
      (a, b) => b.total - a.total
    );
    let hidden = 0;
    let hiddenCount = 0;
    for (const child of children) {
      if (child.total >= threshold) {
        print(child, indent + '  ');
      } else {
        hidden += child.total;
        hiddenCount++;
      }
    }
    if (hiddenCount > 0) {
      console.log(
        `${formatShare(hidden, bucketTotal)}         ${indent}  (${hiddenCount} smaller)`
      );
    }
  }
  print(root, '');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
