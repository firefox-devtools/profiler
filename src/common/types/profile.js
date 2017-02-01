// @flow
export type IndexIntoStackTable = number;
export type IndexIntoSamplesTable = number;
export type IndexIntoMarkersTable = number;
export type IndexIntoFrameTable = number;
export type IndexIntoStringTable = number;
export type IndexIntoFuncTable = number;
export type IndexIntoResourceTable = number;
export type IndexIntoLibs = number;
export type categoryBitMask = number;
export type resourceTypeEnum = number;

export type StackTable = {
  frame: number[],
  length: number,
  prefix: number[],
};

export type SamplesTable = {
  frameNumber: IndexIntoFrameTable[],
  responsiveness: number[],
  stack: IndexIntoStackTable[],
  time: number[],
  rss: any, // TODO
  uss: any, // TODO
  length: number,
};

export type Marker = {
  category?: string,
  interval?: string,
  type?: string,
  dur?: number,
  title?: string,
  start?: number,
  name?: string
};

export type MarkersTable = {
  data: Marker[],
  name: IndexIntoStringTable[],
  time: number[],
  length: number,
};

export type FrameTable = {
  address: IndexIntoStringTable[],
  category: (categoryBitMask | null)[],
  func: IndexIntoFuncTable[],
  implementation: (IndexIntoStringTable | null)[],
  line: (number | null)[],
  optimizations: ({} | null)[],
  length: number
};

export type StringTable = {
  _array: string,
  _stringToIndex: Map<string, number>,
  getString: number => string,
  indexForString: string => number,
  serializeToArray: () => string[],
};

export type FuncTable = {
  address: IndexIntoStringTable[],
  libs: {
    breakpadId: string,
    end: number,
    name: string,
    offset: number,
    pdbName: string,
    start: number,
  }[],
  isJS: boolean[],
  length: number,
  name: IndexIntoStringTable[],
  resource: IndexIntoResourceTable[],
}

export type ResourceTable = {
  addonId: [any],
  icon: [any],
  length: number,
  lib: IndexIntoLibs[],
  name: IndexIntoStringTable,
  type: resourceTypeEnum
}

export type Thread = {
  processType: string,
  name: string,
  tid: number,
  samples: SamplesTable,
  markers: MarkersTable,
  stackTable: StackTable,
  frameTable: FrameTable,
  stringTable: StringTable,
  libs: [],
  funcTable: FuncTable,
  resourceTable: {}
};

export type ProfileMeta = {
  interval: number
};

export type TaskTracer = {};

export type Profile = {
  meta: ProfileMeta,
  tasktracer: TaskTracer,
  threads: [Thread],
};
