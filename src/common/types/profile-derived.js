// @flow
export type IndexIntoFuncStack = number;

export type FuncStackTable = {
  prefix: Int32Array,
  func: Int32Array,
  depth: number[],
  length: number,
}

export type FuncStackInfo = {
  funcStackTable: FuncStackTable,
  stackIndexToFuncStackIndex: Uint32Array,
}
