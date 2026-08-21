/* Temporary: dump the call subtree below one bucket label, as per-iteration
 * weight vectors for both profiles, for docs-developer/auto-bucketing-prototype.mjs.
 *
 *   node node-tools-dist/dump-bucket-subtree.js --base a.jslb.gz --new b.jslb.gz \
 *     --suite React-Complex --bucket "Update style" --depth 3 --out /tmp/subtree.json
 */

import fs from 'fs';
import minimist from 'minimist';
import { unserializeProfileOfArbitraryFormat } from '../profile-logic/process-profile';
import {
  computeIterationMarkersAndMeasuredSamples,
  getBenchmarkInfo,
} from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import type { SamplesTableForThisStuff } from 'firefox-profiler/profile-logic/benchmark/benchmark-stuff';
import {
  correlateIPCMarkers,
  deriveMarkersFromRawMarkerTable,
} from 'firefox-profiler/profile-logic/marker-data';
import {
  computeTimeColumnForRawSamplesTable,
  getTimeRangeForThread,
} from 'firefox-profiler/profile-logic/profile-data';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { ensureExists } from 'firefox-profiler/utils/types';

/**
 * Separator for path keys. A NUL, not a space or a slash: these are C++ symbol
 * names, which contain spaces, colons, angle brackets and parentheses, but never
 * a NUL.
 */
const PATH_SEP = '\u0000';

/** path key -> per-iteration weights */
type PathWeights = Map<string, Float64Array>;

async function extract(
  path: string,
  suiteFilter: string,
  bucketLabel: string,
  maxDepth: number
): Promise<{ paths: PathWeights; iterationCount: number; total: number }> {
  const bytes = fs.readFileSync(path, null);
  const profile = await unserializeProfileOfArbitraryFormat(bytes.buffer);
  const benchmarkInfo = getBenchmarkInfo(profile, 'speedometer');
  const { shared } = profile;
  const thread = profile.threads[benchmarkInfo.threadIndex];
  const { funcTable, stackTable, frameTable, stringArray } = shared;

  const { markers } = deriveMarkersFromRawMarkerTable(
    thread.markers,
    stringArray,
    thread.tid,
    getTimeRangeForThread(thread, profile.meta.interval),
    correlateIPCMarkers(profile.threads, shared)
  );
  const stringTable = StringTable.withBackingArray(stringArray);

  // Deepest JS-relevant func per stack node = the bucket the current extractor
  // would assign. Also record, for each stack node, the truncated and
  // recursion-collapsed path of func names *below* that bucket frame.
  const stackToJsFunc = new Int32Array(stackTable.length);
  const stackPathKey: string[] = new Array(stackTable.length);
  for (let s = 0; s < stackTable.length; s++) {
    const frameIndex = stackTable.frame[s];
    const funcIndex = frameTable.func[frameIndex];
    const prefixOffset = stackTable.prefixOffset[s];
    const parent = prefixOffset !== 0 ? s - prefixOffset : -1;
    const isRelevant =
      funcTable.isJS[funcIndex] || funcTable.relevantForJS[funcIndex];
    if (isRelevant) {
      stackToJsFunc[s] = funcIndex;
      stackPathKey[s] = '';
      continue;
    }
    stackToJsFunc[s] = parent !== -1 ? stackToJsFunc[parent] : -1;
    const parentKey = parent !== -1 ? stackPathKey[parent] : '';
    const name = stringArray[funcTable.name[funcIndex]];
    const parts = parentKey === '' ? [] : parentKey.split(PATH_SEP);
    // Collapse direct recursion: a repeat of the frame directly above adds
    // nothing but depth, and would otherwise split one function's time across
    // as many buckets as the recursion is deep.
    if (parts.length > 0 && parts[parts.length - 1] === name) {
      stackPathKey[s] = parentKey;
    } else if (parts.length >= maxDepth) {
      stackPathKey[s] = parentKey; // truncated: attribute to the depth limit
    } else {
      stackPathKey[s] =
        parentKey === '' ? name : `${parentKey}${PATH_SEP}${name}`;
    }
  }

  const sampleCount = thread.samples.length;
  const sampleBuckets = new Int32Array(sampleCount);
  const bucketFuncs: number[] = [];
  const funcToBucket = new Map<number, number>();
  for (let i = 0; i < sampleCount; i++) {
    const stackIndex = thread.samples.stack[i];
    if (stackIndex === null) {
      sampleBuckets[i] = -1;
      continue;
    }
    const jsFunc = stackToJsFunc[stackIndex];
    let bucket = jsFunc !== -1 ? funcToBucket.get(jsFunc) : -1;
    if (bucket === undefined) {
      bucket = bucketFuncs.length;
      bucketFuncs.push(jsFunc);
      funcToBucket.set(jsFunc, bucket);
    }
    sampleBuckets[i] = bucket;
  }
  const bucketNames = bucketFuncs.map((f) =>
    f === -1 ? '(no JS frame)' : stringArray[funcTable.name[f]]
  );
  const targetBucket = bucketNames.indexOf(bucketLabel);
  if (targetBucket === -1) {
    throw new Error(`no bucket named "${bucketLabel}"`);
  }
  const overheadBucket = bucketNames.indexOf('Profiling overhead');

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
      stringTable,
      overheadBucket !== -1 ? [overheadBucket] : []
    );

  const suiteEntry = markersPerSuite.find(([name]) =>
    name.toLowerCase().includes(suiteFilter.toLowerCase())
  );
  if (suiteEntry === undefined) {
    throw new Error(
      `no suite matching "${suiteFilter}"; have: ${markersPerSuite.map(([n]) => n).join(', ')}`
    );
  }
  const [suiteName, iterationMarkers] = suiteEntry;
  const iterationCount = iterationMarkers.length;
  console.error(`  ${path}: suite ${suiteName}, ${iterationCount} iterations`);

  const paths: PathWeights = new Map();
  let total = 0;
  let sampleIndex = 0;
  for (let it = 0; it < iterationCount; it++) {
    const m = iterationMarkers[it];
    const rangeEnd = ensureExists(m.end);
    for (
      ;
      sampleIndex < sampleCount && measuredSamples.time[sampleIndex] < m.start;
      sampleIndex++
    ) {
      /* before the iteration */
    }
    for (
      ;
      sampleIndex < sampleCount && measuredSamples.time[sampleIndex] < rangeEnd;
      sampleIndex++
    ) {
      if (measuredSamples.bucketIndex[sampleIndex] !== targetBucket) {
        continue;
      }
      const w = measuredSamples.weight[sampleIndex];
      if (w === 0) {
        continue;
      }
      const stackIndex = thread.samples.stack[sampleIndex];
      const key = stackIndex === null ? '' : stackPathKey[stackIndex];
      let vec = paths.get(key);
      if (vec === undefined) {
        vec = new Float64Array(iterationCount);
        paths.set(key, vec);
      }
      vec[it] += w;
      total += w;
    }
  }
  return { paths, iterationCount, total };
}

type TreeNode = {
  key: string;
  base: number[];
  new: number[];
  children: TreeNode[];
};

async function main() {
  const argv = minimist(process.argv.slice(2));
  const maxDepth = Number(argv.depth ?? 3);
  const minShare = Number(argv.minShare ?? 0.02);
  const bucketLabel: string = argv.bucket;

  const [base, nw] = await Promise.all([
    extract(argv.base, argv.suite, bucketLabel, maxDepth),
    extract(argv.new, argv.suite, bucketLabel, maxDepth),
  ]);
  const iterationCount = base.iterationCount;
  console.error(
    `  bucket total weight: base=${base.total.toFixed(0)} new=${nw.total.toFixed(0)}`
  );

  // Build a prefix tree over the path keys, with each node's *self* vector being
  // the samples whose truncated collapsed path is exactly that node.
  const allKeys = new Set([...base.paths.keys(), ...nw.paths.keys()]);
  const root: TreeNode = {
    key: bucketLabel,
    base: new Array<number>(iterationCount).fill(0),
    new: new Array<number>(iterationCount).fill(0),
    children: [],
  };
  const byPath = new Map<string, TreeNode>([['', root]]);
  function ensureNode(key: string): TreeNode {
    const existing = byPath.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const parts = key.split(PATH_SEP);
    const parentKey = parts.slice(0, -1).join(PATH_SEP);
    const parent = ensureNode(parentKey);
    const created: TreeNode = {
      key: '  '.repeat(parts.length) + parts[parts.length - 1],
      base: new Array<number>(iterationCount).fill(0),
      new: new Array<number>(iterationCount).fill(0),
      children: [],
    };
    parent.children.push(created);
    byPath.set(key, created);
    return created;
  }
  for (const key of allKeys) {
    const target = ensureNode(key);
    const b = base.paths.get(key);
    const n = nw.paths.get(key);
    for (let i = 0; i < iterationCount; i++) {
      if (b) {
        target.base[i] += b[i];
      }
      if (n) {
        target.new[i] += n[i];
      }
    }
  }

  // Prune light subtrees, folding their weight into the parent's self so the
  // partition stays exact and the deltas still add up to the bucket's delta.
  const floor = minShare * (base.total + nw.total);
  function subtreeTotal(n: TreeNode): number {
    let t = 0;
    for (let i = 0; i < iterationCount; i++) {
      t += n.base[i] + n.new[i];
    }
    for (const c of n.children) {
      t += subtreeTotal(c);
    }
    return t;
  }
  function foldInto(target: TreeNode, n: TreeNode) {
    for (let i = 0; i < iterationCount; i++) {
      target.base[i] += n.base[i];
      target.new[i] += n.new[i];
    }
    for (const c of n.children) {
      foldInto(target, c);
    }
  }
  function prune(n: TreeNode) {
    const kept: TreeNode[] = [];
    for (const c of n.children) {
      if (subtreeTotal(c) < floor) {
        foldInto(n, c);
      } else {
        kept.push(c);
        prune(c);
      }
    }
    n.children = kept;
  }
  prune(root);

  let nodeCount = 0;
  (function count(n: TreeNode) {
    nodeCount++;
    for (const c of n.children) {
      count(c);
    }
  })(root);
  console.error(
    `  kept ${nodeCount} nodes at depth<=${maxDepth}, minShare=${minShare}`
  );

  fs.writeFileSync(argv.out, JSON.stringify(root));
  console.error(`  wrote ${argv.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
