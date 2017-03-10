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
