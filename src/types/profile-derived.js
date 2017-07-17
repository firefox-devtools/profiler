/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Milliseconds } from './units';
import type { MarkerPayload } from './markers';

export type IndexIntoFuncStackTable = number;

/**
 * Contains a table of stack information that is unique to the function as opposed to
 * being unique to the frame. There can be multiple frames for a single C++ function.
 * Using stacks as opposed to funcStacks can cause duplicated functions in reports
 * like the call tree.
 *
 * For example:
 *
 *            stack1 (funcA)                             funcStack1 (funcA)
 *                 |                                            |
 *                 v                                            v
 *            stack2 (funcB)         stackTable to       funcStack2 (funcB)
 *                 |                funcStackTable              |
 *                 v                      ->                    v
 *            stack3 (funcC)                             funcStack3 (funcC)
 *            /            \                                    |
 *           V              V                                   v
 *    stack4 (funcD)     stack5 (funcD)                  funcStack4 (funcD)
 *         |                  |                          /               \
 *         v                  V                         V                 V
 *    stack6 (funcE)     stack7 (funcF)       funcStack5 (funcE)     funcStack6 (funcF)
 *
 * For a detailed explanation of funcStacks see `docs/func-stacks.md`.
 */
export type FuncStackTable = {
  prefix: Int32Array,
  func: Int32Array,
  depth: number[],
  length: number,
};

/**
 * Both the funcStackTable and a map that converts an IndexIntoStackTable
 * into an IndexIntoFuncStackTable.
 */
export type FuncStackInfo = {
  funcStackTable: FuncStackTable,
  // IndexIntoStackTable -> IndexIntoFuncStackTable
  stackIndexToFuncStackIndex: Uint32Array,
};

export type TracingMarker = {
  start: Milliseconds,
  dur: Milliseconds,
  name: string,
  title: string | null,
  data: MarkerPayload,
};

export type IndexIntoTracingMarkers = number;

export type Node = {
  totalTime: string,
  totalTimePercent: string,
  selfTime: string,
  name: string,
  lib: string,
  dim: boolean,
  icon: string | null,
};

export type IndexIntoMarkerTiming = number;

export type MarkerTiming = {
  // Start time in milliseconds.
  start: number[],
  // End time in milliseconds.
  end: number[],
  index: IndexIntoTracingMarkers[],
  label: string[],
  name: string,
  length: number,
};
export type MarkerTimingRows = Array<MarkerTiming>;
