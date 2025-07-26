/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * TimestampManager provides compact, hierarchical names for timestamps to make
 * them LLM-friendly and token-efficient. This allows LLMs to reference specific
 * time points when using ProfileQuerier (e.g., for range selections).
 *
 * Naming scheme:
 * - In-range timestamps [start, end]: "ts-" prefix (e.g., ts-0, ts-K, ts-gK)
 * - Before-start timestamps: "ts<" prefix with exponential buckets (ts<0, ts<1, ...)
 * - After-end timestamps: "ts>" prefix with exponential buckets (ts>0, ts>1, ...)
 *
 * The hierarchical algorithm creates shorter names for timestamps that are
 * referenced early, with names growing longer as you drill down between existing
 * marks. This keeps token usage low while maintaining precision.
 */

import type { StartEndRange } from 'firefox-profiler/types';
import { bisectionRightByKey } from 'firefox-profiler/utils/bisect';
import { formatTimestamp } from 'firefox-profiler/utils/format-numbers';

/**
 * Build the character alphabet used for timestamp names.
 * Order: 0-9, a-z, A-Z (62 characters total).
 */
function _makeChars(): string[] {
  const chars = [];
  for (let i = 0; i < 10; i++) {
    chars.push('' + i);
  }
  const aLower = 'a'.charCodeAt(0);
  const aUpper = 'A'.charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    chars.push(String.fromCharCode(aLower + i));
    chars.push(String.fromCharCode(aUpper + i));
  }

  return chars;
}

function assert(condition: boolean) {
  if (!condition) {
    throw new Error('assert failed');
  }
}

/**
 * Item represents a node in the hierarchical timestamp tree. Each item
 * corresponds to a specific timestamp and has an index in its level's
 * character space (0-61). Items lazily create children as timestamps
 * between existing marks are requested.
 */
class Item {
  index: number;
  timestamp: number;

  // Children are created on-demand and ordered by timestamp.
  _children: Item[] | null = null;

  constructor(index: number, start: number) {
    this.index = index;
    this.timestamp = start;
  }

  /**
   * Get a hierarchical name for a timestamp within this item's range.
   *
   * Algorithm:
   * 1. If timestamp matches an existing mark, return its name
   * 2. Find the two adjacent marks that bracket the timestamp
   * 3. If marks are adjacent (indices differ by 1), recurse into the left mark
   * 4. Otherwise, interpolate to find a new index and insert a new mark
   *
   * This ensures timestamps requested early get shorter names, with names
   * growing longer as you drill down between existing marks.
   */
  nameForTimestamp(ts: number, end: number, prefix: string): string {
    const start = this.timestamp;
    if (ts < start || ts > end) {
      throw new Error('out of range');
    }
    if (ts === start) {
      return prefix;
    }
    // Lazily initialize with boundary marks at indices 0 and MARKS_PER_LEVEL-1.
    if (this._children === null) {
      this._children = [new Item(0, start), new Item(MARKS_PER_LEVEL - 1, end)];
    }
    // Binary search to find the left mark that brackets this timestamp.
    const i =
      bisectionRightByKey(this._children, ts, (item) => item.timestamp) - 1;
    assert(i >= 0);
    assert(i + 1 < this._children.length);
    const left = this._children[i];
    const right = this._children[i + 1];
    assert(ts >= left.timestamp);
    assert(ts < right.timestamp);
    const leftIndex = left.index;
    const rightIndex = right.index;
    const indexDelta = rightIndex - leftIndex;
    const rightTimestamp = right.timestamp;
    // If marks are adjacent, recurse into the left mark's subrange.
    if (indexDelta === 1) {
      return left.nameForTimestamp(
        ts,
        rightTimestamp,
        prefix + CHARS[leftIndex]
      );
    }
    // Interpolate to find a new index between the two marks.
    const leftTimestamp = left.timestamp;
    const relativeTimestamp = ts - leftTimestamp;
    const timestampDelta = rightTimestamp - leftTimestamp;
    const itemIndex =
      leftIndex +
      1 +
      Math.floor((relativeTimestamp / timestampDelta) * (indexDelta - 1));
    assert(itemIndex > leftIndex);
    assert(itemIndex < rightIndex);
    // Insert the new mark and return its name.
    const item = new Item(itemIndex, ts);
    this._children.splice(i + 1, 0, item);
    return prefix + CHARS[itemIndex];
  }
}

// Character alphabet: 0-9, a-z, A-Z (62 characters)
const CHARS = _makeChars();
const MARKS_PER_LEVEL = CHARS.length;

/**
 * TimestampManager creates compact, hierarchical names for timestamps.
 *
 * Example names for range [1000, 2000]:
 * - 1000 → "ts-0" (range start)
 * - 2000 → "ts-Z" (range end)
 * - 1500 → "ts-K" (middle of range)
 * - 1000.1 → "ts-04" (between ts-0 and ts-1, drills into ts-0's subrange)
 * - 500 → "ts<0K" (before range start, in first bucket before-range)
 * - 2500 → "ts>0K" (after range end, in first bucket after-range)
 *
 * Out-of-bounds timestamps use exponentially doubling buckets:
 * - ts<0: [start - 1×length, start]
 * - ts<1: [start - 2×length, start - 1×length]
 * - ts<2: [start - 4×length, start - 2×length]
 * - ts<n: [start - 2^n×length, start - 2^(n-1)×length]
 * Same pattern for ts> buckets extending to the right.
 */
export class TimestampManager {
  _rootRangeStart: number;
  _rootRangeEnd: number;
  _rootRangeLength: number;
  _mainTree: Item;
  // Trees for exponentially-spaced buckets before/after the main range.
  // Keys are bucket numbers (0, 1, 2, ...), created on-demand.
  _beforeBuckets: Map<number, Item> = new Map();
  _afterBuckets: Map<number, Item> = new Map();
  // Reverse lookup: timestamp name → actual timestamp value.
  // Only contains names that have been returned by nameForTimestamp().
  _nameToTimestamp: Map<string, number> = new Map();

  constructor(rootRange: StartEndRange) {
    this._rootRangeStart = rootRange.start;
    this._rootRangeEnd = rootRange.end;
    this._rootRangeLength = rootRange.end - rootRange.start;
    this._mainTree = new Item(0, rootRange.start);
  }

  /**
   * Get a compact name for a timestamp. Names are minted on-demand and
   * cached for reverse lookup.
   */
  nameForTimestamp(ts: number): string {
    // Check cache first for exact matches.
    for (const [name, cachedTs] of this._nameToTimestamp.entries()) {
      if (cachedTs === ts) {
        return name;
      }
    }

    let name: string;

    // Handle special boundary cases.
    if (ts === this._rootRangeStart) {
      name = 'ts-0';
    } else if (ts === this._rootRangeEnd) {
      name = 'ts-Z';
    } else if (ts < this._rootRangeStart) {
      // Before-start: find the appropriate exponential bucket.
      const distance = this._rootRangeStart - ts;
      const bucketNum = this._getBucketNumber(distance);
      const bucket = this._getOrCreateBeforeBucket(bucketNum);
      const bucketEnd = this._getBeforeBucketEnd(bucketNum);
      name = bucket.nameForTimestamp(ts, bucketEnd, `ts<${bucketNum}`);
    } else if (ts > this._rootRangeEnd) {
      // After-end: find the appropriate exponential bucket.
      const distance = ts - this._rootRangeEnd;
      const bucketNum = this._getBucketNumber(distance);
      const bucket = this._getOrCreateAfterBucket(bucketNum);
      const bucketEnd = this._getAfterBucketEnd(bucketNum);
      name = bucket.nameForTimestamp(ts, bucketEnd, `ts>${bucketNum}`);
    } else {
      // In-range: use main tree.
      name = this._mainTree.nameForTimestamp(ts, this._rootRangeEnd, 'ts-');
    }

    // Cache for reverse lookup.
    this._nameToTimestamp.set(name, ts);
    return name;
  }

  /**
   * Reverse lookup: get the timestamp for a name that was previously
   * returned by nameForTimestamp(). Returns null if the name is unknown.
   */
  timestampForName(name: string): number | null {
    return this._nameToTimestamp.get(name) ?? null;
  }

  /**
   * Format a timestamp as a human-readable string relative to range start.
   */
  timestampString(ts: number): string {
    return formatTimestamp(ts - this._rootRangeStart);
  }

  /**
   * Calculate which bucket number a timestamp belongs to based on distance
   * from the range boundary. Buckets double in size exponentially.
   *
   * Bucket 0: distance <= 1×length
   * Bucket 1: 1×length < distance <= 2×length
   * Bucket 2: 2×length < distance <= 4×length
   * Bucket n: 2^(n-1)×length < distance <= 2^n×length
   */
  _getBucketNumber(distance: number): number {
    const ratio = distance / this._rootRangeLength;
    if (ratio <= 1) {
      return 0;
    }
    return Math.ceil(Math.log2(ratio));
  }

  /**
   * Get the start timestamp for a before-bucket.
   * Bucket n covers [start - 2^n×length, start - 2^(n-1)×length].
   */
  _getBeforeBucketStart(bucketNum: number): number {
    const distanceFromStart = Math.pow(2, bucketNum) * this._rootRangeLength;
    return this._rootRangeStart - distanceFromStart;
  }

  /**
   * Get the end timestamp for a before-bucket.
   */
  _getBeforeBucketEnd(bucketNum: number): number {
    if (bucketNum === 0) {
      return this._rootRangeStart;
    }
    const distanceFromStart =
      Math.pow(2, bucketNum - 1) * this._rootRangeLength;
    return this._rootRangeStart - distanceFromStart;
  }

  /**
   * Get the start timestamp for an after-bucket.
   * Bucket n covers [end + 2^(n-1)×length, end + 2^n×length].
   */
  _getAfterBucketStart(bucketNum: number): number {
    if (bucketNum === 0) {
      return this._rootRangeEnd;
    }
    const distanceFromEnd = Math.pow(2, bucketNum - 1) * this._rootRangeLength;
    return this._rootRangeEnd + distanceFromEnd;
  }

  /**
   * Get the end timestamp for an after-bucket.
   */
  _getAfterBucketEnd(bucketNum: number): number {
    const distanceFromEnd = Math.pow(2, bucketNum) * this._rootRangeLength;
    return this._rootRangeEnd + distanceFromEnd;
  }

  /**
   * Get or create an Item tree for a before-bucket.
   */
  _getOrCreateBeforeBucket(bucketNum: number): Item {
    let bucket = this._beforeBuckets.get(bucketNum);
    if (!bucket) {
      const bucketStart = this._getBeforeBucketStart(bucketNum);
      bucket = new Item(0, bucketStart);
      this._beforeBuckets.set(bucketNum, bucket);
    }
    return bucket;
  }

  /**
   * Get or create an Item tree for an after-bucket.
   */
  _getOrCreateAfterBucket(bucketNum: number): Item {
    let bucket = this._afterBuckets.get(bucketNum);
    if (!bucket) {
      const bucketStart = this._getAfterBucketStart(bucketNum);
      bucket = new Item(0, bucketStart);
      this._afterBuckets.set(bucketNum, bucket);
    }
    return bucket;
  }
}
