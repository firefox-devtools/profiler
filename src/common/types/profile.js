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
export type MemoryOffset = number;
export type ThreadIndex = number;

export type StackTable = {
  frame: number[],
  length: number,
  prefix: Array<number|null>,
};

export type SamplesTable = {
  frameNumber: IndexIntoFrameTable[],
  responsiveness: number[],
  stack: Array<IndexIntoStackTable|null>,
  time: number[],
  rss: any, // TODO
  uss: any, // TODO
  length: number,
};

export type MarkerData = {
  category?: string,
  interval?: string,
  type?: string,
  title?: string,
  startTime?: number,
  endTime?: number,
};

export type MarkersTable = {
  data: (MarkerData|null)[],
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
  length: number,
};

export type StringTable = {
  _array: string,
  _stringToIndex: Map<string, number>,
  getString: number => string,
  indexForString: string => number,
  serializeToArray: () => string[],
};

export type FuncTable = {
  address: MemoryOffset[],
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
  resource: Array<IndexIntoResourceTable|-1>,
  fileName: Array<IndexIntoStringTable|null>,
  lineNumber: Array<number|null>,
}

export type ResourceTable = {
  addonId: [any],
  icon: [any],
  length: number,
  lib: IndexIntoLibs[],
  name: IndexIntoStringTable[],
  type: resourceTypeEnum[],
}

export type Thread = {
  processType: string,
  name: string,
  pid: number | void,
  tid: number | void,
  samples: SamplesTable,
  markers: MarkersTable,
  stackTable: StackTable,
  frameTable: FrameTable,
  stringTable: StringTable,
  libs: [],
  funcTable: FuncTable,
  resourceTable: ResourceTable,
};

export type ProfileMeta = {
  interval: number,
};

export type TaskTracer = {
  taskTable: Object,
  threadTable: Object,
};

export type Profile = {
  meta: ProfileMeta,
  tasktracer: TaskTracer,
  threads: Thread[],
};
