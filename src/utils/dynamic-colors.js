/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { parseFileNameFromSymbolication } from './special-paths';
import { okhsl_to_srgb, okhsv_to_srgb, rgb_to_hex } from './oklab';
import { assertExhaustiveCheck } from './flow';

export const BUCKET_HUE_COUNT = 15;
export const BUCKET_COLOR_COUNT_PER_HUE = 3;
export const BUCKET_COLOR_COUNT = BUCKET_HUE_COUNT * BUCKET_COLOR_COUNT_PER_HUE;

// Switch between OKHSL and OKHSV.
// Play with https://bottosson.github.io/misc/colorpicker/ to see how the two
// are different.
const USE_HSL = false; // false for HSV

export function resolveDynamicColor(
  fileName: string | null,
  resourceName: string | null,
  _resourceType: number
): string {
  const bucketName =
    (fileName !== null ? getBucketNameForFile(fileName) : null) ??
    resourceName ??
    '<null>';
  const bucketIndex = dynamicColorIndexForBucket(bucketName);
  return bucketColorForIndex(bucketIndex);
}

export function resolveBucketColorName(
  fileName: string | null,
  resourceName: string | null,
  resourceType: number
): string {
  return `dynamic-${resolveBucketIndex(fileName, resourceName, resourceType)}`;
}

export function resolveBucketIndex(
  fileName: string | null,
  resourceName: string | null,
  _resourceType: number
): number {
  const bucketName =
    (fileName !== null ? getBucketNameForFile(fileName) : null) ??
    resourceName ??
    '<null>';
  return dynamicColorIndexForBucket(bucketName);
}

export function bucketColorForIndex(dynamicColorIndex: number): string {
  const perHueIndex = dynamicColorIndex % BUCKET_COLOR_COUNT_PER_HUE;
  const hueIndex =
    Math.floor(dynamicColorIndex / BUCKET_COLOR_COUNT_PER_HUE) %
    BUCKET_HUE_COUNT;
  const h = hueIndex / BUCKET_HUE_COUNT;
  if (USE_HSL) {
    const [s, l] = [
      [0.95, 0.8], // light
      [0.95, 0.6], // medium
      [0.95, 0.4], // dark
    ][perHueIndex];
    const [r, g, b] = okhsl_to_srgb(h, s, l);
    return rgb_to_hex(r, g, b);
  }
  const [s, v] = [
    [0.6, 1], // light
    [0.9, 1], // most vibrant
    [1, 0.6], // dark
  ][perHueIndex];
  const [r, g, b] = okhsv_to_srgb(h, s, v);
  return rgb_to_hex(r, g, b);
}

function dynamicColorIndexForBucket(bucket: string): number {
  const hash = cyrb53(bucket);
  return hash % BUCKET_COLOR_COUNT;
}

// from https://stackoverflow.com/a/52171480
function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function getBucketNameForFile(file: string): string | null {
  const parsedFileName = parseFileNameFromSymbolication(file);
  switch (parsedFileName.type) {
    case 'normal':
      return null;
    case 'hg':
      return parsedFileName.repo;
    case 'git':
      return parsedFileName.repo;
    case 's3':
      return parsedFileName.bucket;
    case 'cargo':
      return parsedFileName.crate;
    default:
      throw assertExhaustiveCheck(parsedFileName.type);
  }
}
