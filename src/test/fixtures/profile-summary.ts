/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Profile,
  RawThread,
  IndexIntoStackTable,
  RawStackTable,
  RawFrameTable,
  FuncTable,
} from 'firefox-profiler/types';
import { FrameFlag } from 'firefox-profiler/types';

/**
 * Walks a raw profile and asserts a set of structural invariants. Throws
 * on the first violation.
 *
 * This catches "silent emptying" or "dangling reference" regressions in
 * importers: e.g. samples pointing at stacks that don't exist, frames
 * referring to funcs outside the funcTable, marker names referring to
 * string indices that don't exist.
 */
export function assertProfileIntegrity(profile: Profile): void {
  const { shared, threads, meta } = profile;
  const {
    stackTable,
    frameTable,
    funcTable,
    resourceTable,
    nativeSymbols,
    stringArray,
  } = shared;
  const stringCount = stringArray.length;
  const numCategories = meta.categories ? meta.categories.length : 0;

  for (let s = 0; s < stackTable.length; s++) {
    const frame = stackTable.frame[s];
    if (!Number.isInteger(frame) || frame < 0 || frame >= frameTable.length) {
      throw new Error(
        `stackTable.frame[${s}] = ${frame} is not a valid integer index in [0, ${frameTable.length})`
      );
    }
    const offset = stackTable.prefixOffset[s];
    if (!Number.isInteger(offset) || offset < 0 || offset > s) {
      throw new Error(
        `stackTable.prefixOffset[${s}] = ${offset} is invalid (must be an integer in [0, ${s}])`
      );
    }
  }

  for (let f = 0; f < frameTable.length; f++) {
    const func = frameTable.func[f];
    if (!Number.isInteger(func) || func < 0 || func >= funcTable.length) {
      throw new Error(
        `frameTable.func[${f}] = ${func} is not a valid integer index in [0, ${funcTable.length})`
      );
    }
    const flags = frameTable.flags[f];
    if ((flags & FrameFlag.HasNativeSymbol) !== 0) {
      const ns = frameTable.nativeSymbol[f];
      if (!Number.isInteger(ns) || ns < 0 || ns >= nativeSymbols.length) {
        throw new Error(
          `frameTable.nativeSymbol[${f}] = ${ns} is not a valid integer index in [0, ${nativeSymbols.length})`
        );
      }
    }
    if ((flags & FrameFlag.HasCategory) !== 0) {
      const cat = frameTable.category[f];
      if (!Number.isInteger(cat) || cat < 0 || cat >= numCategories) {
        throw new Error(
          `frameTable.category[${f}] = ${cat} is not a valid integer index in [0, ${numCategories})`
        );
      }
    }
  }

  for (let fn = 0; fn < funcTable.length; fn++) {
    const name = funcTable.name[fn];
    if (!Number.isInteger(name) || name < 0 || name >= stringCount) {
      throw new Error(
        `funcTable.name[${fn}] = ${name} is not a valid integer index in [0, ${stringCount})`
      );
    }
    const res = funcTable.resource[fn];
    if (
      !Number.isInteger(res) ||
      (res !== -1 && (res < 0 || res >= resourceTable.length))
    ) {
      throw new Error(
        `funcTable.resource[${fn}] = ${res} is not a valid integer index in [0, ${resourceTable.length}) or -1`
      );
    }
  }

  for (let n = 0; n < nativeSymbols.length; n++) {
    const name = nativeSymbols.name[n];
    if (!Number.isInteger(name) || name < 0 || name >= stringCount) {
      throw new Error(
        `nativeSymbols.name[${n}] = ${name} is not a valid integer index in [0, ${stringCount})`
      );
    }
  }

  const foundTids = new Set<unknown>();
  for (const thread of threads) {
    const { tid, samples, markers, nativeAllocations, jsAllocations } = thread;
    if (tid === undefined) {
      throw new Error(`Thread ${thread.name} has undefined tid`);
    }
    if (foundTids.has(tid)) {
      throw new Error(`Duplicate tid ${tid}`);
    }
    foundTids.add(tid);

    checkStackRefs(
      thread.name,
      'samples',
      samples.stack,
      samples.length,
      stackTable.length
    );

    if (nativeAllocations) {
      checkStackRefs(
        thread.name,
        'nativeAllocations',
        nativeAllocations.stack,
        nativeAllocations.length,
        stackTable.length
      );
    }
    if (jsAllocations) {
      checkStackRefs(
        thread.name,
        'jsAllocations',
        jsAllocations.stack,
        jsAllocations.length,
        stackTable.length
      );
    }

    for (let i = 0; i < markers.length; i++) {
      const name = markers.name[i];
      if (!Number.isInteger(name) || name < 0 || name >= stringCount) {
        throw new Error(
          `thread ${thread.name} markers.name[${i}] = ${name} is not a valid integer index in [0, ${stringCount})`
        );
      }
      const cat = markers.category[i];
      if (!Number.isInteger(cat) || cat < 0 || cat >= numCategories) {
        throw new Error(
          `thread ${thread.name} markers.category[${i}] = ${cat} is not a valid integer index in [0, ${numCategories})`
        );
      }
    }
  }
}

function checkStackRefs(
  threadName: string,
  field: string,
  stacks: Array<IndexIntoStackTable | null>,
  length: number,
  stackTableLength: number
): void {
  for (let i = 0; i < length; i++) {
    const s = stacks[i];
    if (
      s !== null &&
      (!Number.isInteger(s) || s < 0 || s >= stackTableLength)
    ) {
      throw new Error(
        `thread ${threadName} ${field}.stack[${i}] = ${s} is not a valid integer index in [0, ${stackTableLength})`
      );
    }
  }
}

type ThreadSummary = {
  name: string;
  pid: string | number;
  tid: string | number;
  isMainThread: boolean;
  sampleCount: number;
  sampleWeightTotal: number | null;
  markerCount: number;
  markerNamesTop: string[];
  jsAllocationCount: number;
  nativeAllocationCount: number;
  nativeAllocationWeightTotal: number | null;
  weightType: string;
};

export type ProfileSummary = {
  meta: {
    product: string;
    importedFrom: string | undefined;
    interval: number;
    version: number;
    preprocessedProfileVersion: number;
    symbolicated: boolean | undefined;
    categoryNames: string[];
    markerSchemaNames: string[];
  };
  sharedCounts: {
    funcs: number;
    frames: number;
    stacks: number;
    resources: number;
    nativeSymbols: number;
    strings: number;
    libs: number;
  };
  threads: ThreadSummary[];
};

/**
 * Produces a small, human-reviewable summary of a Profile. Snapshot this
 * instead of the full profile: it captures the "shape" of the imported
 * data (thread names, counts, categories, weight totals) without
 * including the tens of thousands of array entries that make full-profile
 * snapshots unreviewable.
 */
export function summarizeProfile(profile: Profile): ProfileSummary {
  const { meta, shared, libs, threads } = profile;
  const stringArray = shared.stringArray;
  return {
    meta: {
      product: meta.product,
      importedFrom: meta.importedFrom,
      interval: meta.interval,
      version: meta.version,
      preprocessedProfileVersion: meta.preprocessedProfileVersion,
      symbolicated: meta.symbolicated,
      categoryNames: (meta.categories ?? []).map((c) => c.name),
      markerSchemaNames: (meta.markerSchema ?? []).map((s) => s.name),
    },
    sharedCounts: {
      funcs: shared.funcTable.length,
      frames: shared.frameTable.length,
      stacks: shared.stackTable.length,
      resources: shared.resourceTable.length,
      nativeSymbols: shared.nativeSymbols.length,
      strings: stringArray.length,
      libs: libs.length,
    },
    threads: threads.map((t) => summarizeThread(t, stringArray)),
  };
}

function summarizeThread(
  thread: RawThread,
  stringArray: string[]
): ThreadSummary {
  const markerNameCounts = new Map<string, number>();
  for (let i = 0; i < thread.markers.length; i++) {
    const name = stringArray[thread.markers.name[i]];
    markerNameCounts.set(name, (markerNameCounts.get(name) ?? 0) + 1);
  }
  const markerNamesTop = Array.from(markerNameCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n, c]) => `${n} (${c})`);

  const sampleWeightTotal = sumWeight(
    thread.samples.weight,
    thread.samples.length
  );

  const nativeAllocs = thread.nativeAllocations;
  const nativeAllocationCount = nativeAllocs ? nativeAllocs.length : 0;
  const nativeAllocationWeightTotal = nativeAllocs
    ? sumWeight(nativeAllocs.weight, nativeAllocs.length)
    : null;

  return {
    name: thread.name,
    pid: thread.pid,
    tid: thread.tid,
    isMainThread: thread.isMainThread,
    sampleCount: thread.samples.length,
    sampleWeightTotal,
    markerCount: thread.markers.length,
    markerNamesTop,
    jsAllocationCount: thread.jsAllocations ? thread.jsAllocations.length : 0,
    nativeAllocationCount,
    nativeAllocationWeightTotal,
    weightType: thread.samples.weightType,
  };
}

function sumWeight(
  weight: number[] | null | undefined,
  length: number
): number | null {
  if (!weight) {
    return null;
  }
  let total = 0;
  for (let i = 0; i < length; i++) {
    total += weight[i];
  }
  return total;
}

type SampleLikeSource = 'samples' | 'nativeAllocations' | 'jsAllocations';

/**
 * Returns a snapshot of the top-K unique stacks in a thread, ranked by
 * their weight (or count if unweighted).
 *
 * If `source` is omitted, the first non-empty of samples /
 * nativeAllocations / jsAllocations is used. This makes the helper work
 * uniformly across importers that use different weight sources (e.g.
 * dhat uses nativeAllocations).
 *
 * The output looks like:
 *
 *   [
 *     '1024 (12x) main -> foo -> bar',
 *     '512 (6x) main -> baz',
 *     ...
 *   ]
 *
 * where the leading number is the summed weight for that stack and
 * `(Nx)` is the number of hits. This is compact, human-reviewable, and
 * catches semantic regressions such as: empty stacks (dhat bug), wrong
 * function name attribution, weight-total regressions, and category
 * leakage. It is intentionally insensitive to internal encoding details
 * like table ordering.
 */
export function topStacksByWeight(
  profile: Profile,
  threadIndex: number,
  topK: number = 5,
  source?: SampleLikeSource
): string[] {
  const thread = profile.threads[threadIndex];
  const { stackTable, frameTable, funcTable, stringArray } = profile.shared;

  const sampleLike = source
    ? getSampleLike(thread, source)
    : pickNonEmptySampleLike(thread);
  if (!sampleLike) {
    return [];
  }

  const totals = new Map<
    IndexIntoStackTable | null,
    { weight: number; count: number }
  >();
  for (let i = 0; i < sampleLike.length; i++) {
    const s = sampleLike.stack[i];
    const w = sampleLike.weight ? sampleLike.weight[i] : 1;
    const cur = totals.get(s);
    if (cur) {
      cur.weight += w;
      cur.count += 1;
    } else {
      totals.set(s, { weight: w, count: 1 });
    }
  }

  const sorted = Array.from(totals.entries()).sort(
    (a, b) => Math.abs(b[1].weight) - Math.abs(a[1].weight)
  );

  return sorted.slice(0, topK).map(([stack, { weight, count }]) => {
    const path = renderStackPath(
      stack,
      stackTable,
      frameTable,
      funcTable,
      stringArray
    );
    return `${weight} (${count}x) ${path}`;
  });
}

function pickNonEmptySampleLike(thread: RawThread) {
  const samples = getSampleLike(thread, 'samples');
  if (samples && samples.length > 0) {
    return samples;
  }
  const native = getSampleLike(thread, 'nativeAllocations');
  if (native && native.length > 0) {
    return native;
  }
  const js = getSampleLike(thread, 'jsAllocations');
  if (js && js.length > 0) {
    return js;
  }
  return samples;
}

function getSampleLike(
  thread: RawThread,
  source: SampleLikeSource
): {
  stack: Array<IndexIntoStackTable | null>;
  weight: number[] | null;
  length: number;
} | null {
  if (source === 'samples') {
    return {
      stack: thread.samples.stack,
      weight: thread.samples.weight,
      length: thread.samples.length,
    };
  }
  if (source === 'nativeAllocations' && thread.nativeAllocations) {
    return {
      stack: thread.nativeAllocations.stack,
      weight: thread.nativeAllocations.weight,
      length: thread.nativeAllocations.length,
    };
  }
  if (source === 'jsAllocations' && thread.jsAllocations) {
    return {
      stack: thread.jsAllocations.stack,
      weight: thread.jsAllocations.weight,
      length: thread.jsAllocations.length,
    };
  }
  return null;
}

/**
 * Convenience wrapper that bundles a profile "shape" summary plus a
 * top-K stack listing per thread into a single object, suitable for
 * `toMatchSnapshot()`. This is the standard snapshot payload for
 * importer tests: it's small, human-reviewable, and gives good coverage
 * against the common regression classes (silent emptying, wrong
 * attribution, metadata drift, sample/marker loss).
 */
export function profileImportSnapshot(
  profile: Profile,
  topK: number = 5
): {
  summary: ProfileSummary;
  topStacksPerThread: Array<{
    thread: string;
    tid: string | number;
    stacks: string[];
  }>;
} {
  return {
    summary: summarizeProfile(profile),
    topStacksPerThread: profile.threads.map((t, i) => ({
      thread: t.name,
      tid: t.tid,
      stacks: topStacksByWeight(profile, i, topK),
    })),
  };
}

function renderStackPath(
  stack: IndexIntoStackTable | null,
  stackTable: RawStackTable,
  frameTable: RawFrameTable,
  funcTable: FuncTable,
  stringArray: string[]
): string {
  if (stack === null) {
    return '(null stack)';
  }
  const names: string[] = [];
  let s: IndexIntoStackTable | null = stack;
  while (s !== null) {
    const frame = stackTable.frame[s];
    const func = frameTable.func[frame];
    names.push(stringArray[funcTable.name[func]]);
    const offset: number = stackTable.prefixOffset[s];
    s = offset === 0 ? null : s - offset;
  }
  return names.reverse().join(' -> ');
}
