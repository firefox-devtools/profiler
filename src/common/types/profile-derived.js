// @flow
import type { Milliseconds } from './units';

export type IndexIntoFuncStackTable = number;

export type FuncStackTable = {
  prefix: Int32Array,
  func: Int32Array,
  depth: number[],
  length: number,
};

export type FuncStackInfo = {
  funcStackTable: FuncStackTable,
  stackIndexToFuncStackIndex: Uint32Array,
};

export type TracingMarker = {
  start: Milliseconds,
  dur: Milliseconds,
  name: string,
  title: string|null,
};

export type Node = {
  totalTime: string,
  totalTimePercent: string,
  selfTime: string,
  name: string,
  lib: string,
  dim: boolean,
  icon: string | null,
};

export type MarkerTiming = {
  // Start time in milliseconds.
  start: number[],
  // End time in milliseconds.
  end: number[],
  index: number[],
  name: string,
  length: number,
};
export type MarkerTimingRows = Array<MarkerTiming>
