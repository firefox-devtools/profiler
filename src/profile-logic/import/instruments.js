/* eslint-disable no-nested-ternary */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This file is adapted from the Speedscope project to convert to a Firefox Profiler format.
// https://github.com/jlfwong/speedscope/blob/6a979bb568f548dd347dba5b18e69e4401a2dda3/src/import/instruments.ts
// The original license for that project is duplicated below.

// MIT License
//
// Copyright (c) 2018 Jamie Wong
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import JSZip, { type JSZipFile } from 'jszip';
import {
  ensureExists,
  objectValues,
  getFirstItemFromMap,
} from 'firefox-profiler/utils/flow';
import type { ObjectMap, Profile } from 'firefox-profiler/types';
import { getEmptyProfile, getEmptyThread } from '../data-structures';

// This file contains methods to import data from OS X Instruments.app
// https://developer.apple.com/library/content/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/index.html

// TODO - importFromInstrumentsDeepCopy
// function parseTSV<T>(contents: string): T[] {
//   const lines = contents.split('\n').map(l => l.split('\t'));

//   const headerLine = lines.shift();
//   if (!headerLine) {
//     return [];
//   }

//   const indexToField = new Map<number, string>();
//   for (let i = 0; i < headerLine.length; i++) {
//     indexToField.set(i, headerLine[i]);
//   }

//   const ret: T[] = [];
//   for (const line of lines) {
//     const row = {};
//     for (let i = 0; i < line.length; i++) {
//       row[ensureExists(indexToField.get(i))] = line[i];
//     }
//     ret.push(coerce<any, T>(row));
//   }
//   return ret;
// }
//
// type PastedTimeProfileRow = {
//   Weight?: string,
//   'Source Path'?: string,
//   'Symbol Name'?: string,
// };
//
// type PastedAllocationsProfileRow = {
//   'Bytes Used'?: string,
//   'Source Path'?: string,
//   'Symbol Name'?: string,
// };

type FrameInfo = {
  key: string | number,

  // Name of the frame. May be a method name, e.g.
  // "ActiveRecord##to_hash"
  name: string,

  // JSZipFile path of the code corresponding to this
  // call stack frame.
  file?: string,

  // Line in the given file where this frame occurs
  line?: number,

  // Column in the file
  col?: number,
};

// TODO - importFromInstrumentsDeepCopy
// interface FrameInfoWithWeight extends FrameInfo {
//   endValue: number;
// }

// TODO - importFromInstrumentsDeepCopy
// function getWeight(deepCopyRow: any): number {
//   if ('Bytes Used' in deepCopyRow) {
//     const bytesUsedString = deepCopyRow['Bytes Used'];
//     const parts = /\s*(\d+(?:[.]\d+)?) (\w+)\s+(?:\d+(?:[.]\d+))%/.exec(
//       bytesUsedString
//     );
//     if (!parts) {
//       return 0;
//     }
//     const value = parseInt(parts[1], 10);
//     const units = parts[2];

//     switch (units) {
//       case 'Bytes':
//         return value;
//       case 'KB':
//         return 1024 * value;
//       case 'MB':
//         return 1024 * 1024 * value;
//       case 'GB':
//         return 1024 * 1024 * 1024 * value;
//       default:
//         throw new Error(`Unrecognized units ${units}`);
//     }
//   }

//   if ('Weight' in deepCopyRow || 'Running Time' in deepCopyRow) {
//     const weightString = deepCopyRow.Weight || deepCopyRow['Running Time'];
//     const parts = /\s*(\d+(?:[.]\d+)?) ?(\w+)\s+(?:\d+(?:[.]\d+))%/.exec(
//       weightString
//     );
//     if (!parts) {
//       return 0;
//     }
//     const value = parseInt(parts[1], 10);
//     const units = parts[2];

//     switch (units) {
//       case 'ms':
//         return value;
//       case 's':
//         return 1000 * value;
//       case 'min':
//         return 1000 * value;
//       default:
//         throw new Error(`Unrecognized units ${units}`);
//     }
//   }

//   return -1;
// }

// TODO - This is currently not migrated.
// Import from a deep copy made of a profile
// export function importFromInstrumentsDeepCopy(contents: string): Profile {
//   const profile = new CallTreeProfileBuilder();
//   const rows = parseTSV<PastedTimeProfileRow | PastedAllocationsProfileRow>(
//     contents
//   );

//   const stack: FrameInfoWithWeight[] = [];
//   let cumulativeValue: number = 0;

//   for (const row of rows) {
//     const symbolName = row['Symbol Name'];
//     if (!symbolName) {
//       continue;
//     }
//     const trimmedSymbolName = symbolName.trim();
//     const stackDepth = symbolName.length - trimmedSymbolName.length;

//     if (stack.length - stackDepth < 0) {
//       throw new Error('Invalid format');
//     }

//     const framesToLeave: FrameInfoWithWeight[] = [];

//     while (stackDepth < stack.length) {
//       const stackTop = ensureExists(stack.pop());
//       framesToLeave.push(stackTop);
//     }

//     for (const frameToLeave of framesToLeave) {
//       cumulativeValue = Math.max(cumulativeValue, frameToLeave.endValue);
//       profile.leaveFrame(frameToLeave, cumulativeValue);
//     }

//     const newFrameInfo: FrameInfoWithWeight = {
//       key: `${row['Source Path'] || ''}:${trimmedSymbolName}`,
//       name: trimmedSymbolName,
//       file: row['Source Path'],
//       endValue: cumulativeValue + getWeight(row),
//     };

//     profile.enterFrame(newFrameInfo, cumulativeValue);
//     stack.push(newFrameInfo);
//   }

//   while (stack.length > 0) {
//     const frameToLeave = ensureExists(stack.pop());
//     cumulativeValue = Math.max(cumulativeValue, frameToLeave.endValue);
//     profile.leaveFrame(frameToLeave, cumulativeValue);
//   }

//   if ('Bytes Used' in rows[0]) {
//     profile.setValueFormatter(new ByteFormatter());
//   } else if ('Weight' in rows[0] || 'Running Time' in rows[0]) {
//     profile.setValueFormatter(new TimeFormatter('milliseconds'));
//   }

//   return profile.build();
// }

interface TraceDirectoryTree {
  name: string;
  files: Map<string, JSZipFile>;
  subdirectories: Map<string, TraceDirectoryTree>;
}

function getCoreDirForRun(
  tree: TraceDirectoryTree,
  selectedRun: number
): TraceDirectoryTree {
  const corespace = getOrThrow(tree.subdirectories, 'corespace');
  const corespaceRunDir = getOrThrow(
    corespace.subdirectories,
    `run${selectedRun}`
  );
  return getOrThrow(corespaceRunDir.subdirectories, 'core');
}

class BinReader {
  bytePos: number = 0;
  view: DataView;
  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }
  seek(pos: number) {
    this.bytePos = pos;
  }
  skip(byteCount: number) {
    this.bytePos += byteCount;
  }
  hasMore() {
    return this.bytePos < this.view.byteLength;
  }
  bytesLeft() {
    return this.view.byteLength - this.bytePos;
  }
  readUint8() {
    this.bytePos++;
    if (this.bytePos > this.view.byteLength) {
      return 0;
    }
    return this.view.getUint8(this.bytePos - 1);
  }

  // Note: we intentionally use Math.pow here rather than bit shifts
  // because JavaScript doesn't have true 64 bit integers.
  readUint32() {
    this.bytePos += 4;
    if (this.bytePos > this.view.byteLength) {
      return 0;
    }
    return this.view.getUint32(this.bytePos - 4, true);
  }
  readUint48() {
    this.bytePos += 6;
    if (this.bytePos > this.view.byteLength) {
      return 0;
    }

    return (
      this.view.getUint32(this.bytePos - 6, true) +
      this.view.getUint16(this.bytePos - 2, true) * Math.pow(2, 32)
    );
  }
  readUint64() {
    this.bytePos += 8;
    if (this.bytePos > this.view.byteLength) {
      return 0;
    }
    return (
      this.view.getUint32(this.bytePos - 8, true) +
      this.view.getUint32(this.bytePos - 4, true) * Math.pow(2, 32)
    );
  }
}

interface Sample {
  timestamp: number;
  threadID: number;
  backtraceID: number;
}

async function getRawSampleList(core: TraceDirectoryTree): Promise<Sample[]> {
  const stores = getOrThrow(core.subdirectories, 'stores');
  for (const storedir of stores.subdirectories.values()) {
    const schemaFile = storedir.files.get('schema.xml');
    if (!schemaFile) {
      continue;
    }
    const schema = await schemaFile.async('string');
    if (!/name="time-profile"/.exec(schema)) {
      continue;
    }
    const bulkstore = new BinReader(
      await getOrThrow(storedir.files, 'bulkstore').async('arraybuffer')
    );
    // Ignore the first 3 words
    bulkstore.readUint32();
    bulkstore.readUint32();
    bulkstore.readUint32();
    const headerSize = bulkstore.readUint32();
    const bytesPerEntry = bulkstore.readUint32();

    bulkstore.seek(headerSize);

    const samples: Sample[] = [];
    while (true) {
      // Schema as of Instruments 8.3.3 is a 6 byte timestamp, followed by a bunch
      // of stuff we don't care about, followed by a 4 byte backtrace ID
      const timestamp = bulkstore.readUint48();
      if (timestamp === 0) {
        break;
      }

      const threadID = bulkstore.readUint32();

      bulkstore.skip(bytesPerEntry - 6 - 4 - 4);
      const backtraceID = bulkstore.readUint32();
      samples.push({ timestamp, threadID, backtraceID });
    }
    return samples;
  }
  throw new Error('Could not find sample list');
}

async function getIntegerArrays(
  samples: Sample[],
  core: TraceDirectoryTree
): Promise<number[][]> {
  const uniquing = getOrThrow(core.subdirectories, 'uniquing');
  const arrayUniquer = getOrThrow(uniquing.subdirectories, 'arrayUniquer');
  const integeruniquerindex = getOrThrow(
    arrayUniquer.files,
    'integeruniquer.index'
  );
  const integeruniquerdata = getOrThrow(
    arrayUniquer.files,
    'integeruniquer.data'
  );

  // integeruniquer.index is a binary file containing an array of [byte offset, MB offset] pairs
  // that indicate where array data starts in the .data file

  // integeruniquer.data is a binary file containing an array of arrays of 64 bit integer.
  // The schema is a 32 byte header followed by a stream of arrays.
  // Each array consists of a 4 byte size N followed by N 8 byte little endian integers

  // This table contains the memory addresses of stack frames

  const indexreader = new BinReader(
    await integeruniquerindex.async('arraybuffer')
  );
  const datareader = new BinReader(
    await integeruniquerdata.async('arraybuffer')
  );

  // Header we don't care about
  indexreader.seek(32);

  const arrays: number[][] = [];

  while (indexreader.hasMore()) {
    const byteOffset =
      indexreader.readUint32() + indexreader.readUint32() * (1024 * 1024);

    if (byteOffset === 0) {
      // The first entry in the index table seems to just indicate the offset of
      // the header into the data file
      continue;
    }

    datareader.seek(byteOffset);

    let length = datareader.readUint32();
    const array: number[] = [];

    while (length--) {
      array.push(datareader.readUint64());
    }
    arrays.push(array);
  }

  return arrays;
}

type SymbolInfo = {
  symbolName: string | null,
  sourcePath: string | null,
  addressToLine: Map<number, number>,
};

type FormTemplateRunData = {
  number: number,
  addressToFrameMap: Map<number, FrameInfo>,
};

type FormTemplateData = {
  version: number,
  selectedRunNumber: number,
  instrument: string,
  runs: FormTemplateRunData[],
};

type SymbolsByPid = Map<number, { symbols: SymbolInfo[] }>;

async function readFormTemplate(
  tree: TraceDirectoryTree
): Promise<FormTemplateData> {
  const formTemplate = getOrThrow(tree.files, 'form.template');
  const formTemplateData = await formTemplate.async('uint8array');
  const archive = readInstrumentsKeyedArchive(formTemplateData);

  const version = archive['com.apple.xray.owner.template.version'];
  let selectedRunNumber = 1;
  if ('com.apple.xray.owner.template' in archive) {
    selectedRunNumber = archive['com.apple.xray.owner.template'].get(
      '_selectedRunNumber'
    );
  }
  let instrument = archive.$1;
  if ('stubInfoByUUID' in archive) {
    instrument = Array.from(archive.stubInfoByUUID.keys())[0];
  }
  const allRunData = archive['com.apple.xray.run.data'];

  const runs: FormTemplateRunData[] = [];
  for (const runNumber of allRunData.runNumbers) {
    const runData = getOrThrow<number, Map<any, any>>(
      allRunData.runData,
      runNumber
    );

    const symbolsByPid: SymbolsByPid | void = runData.get('symbolsByPid');

    // Build a frame map if the symbols are there.
    const addressToFrameMap = new Map<number, FrameInfo>();
    if (symbolsByPid) {
      // TODO(jlfwong): Deal with profiles with conflicting addresses?
      for (const symbols of symbolsByPid.values()) {
        for (const symbol of symbols.symbols) {
          if (!symbol) {
            continue;
          }
          const { sourcePath, symbolName, addressToLine } = symbol;
          for (const address of addressToLine.keys()) {
            getOrInsert(addressToFrameMap, address, () => {
              const name =
                symbolName || `0x${zeroPad(address.toString(16), 16)}`;
              const key: string = `${sourcePath || 'null'}:${name}`;
              const frame: FrameInfo = {
                key,
                name: name,
              };
              if (sourcePath) {
                frame.file = sourcePath;
              }
              return frame;
            });
          }
        }
      }

      runs.push({
        number: runNumber,
        addressToFrameMap,
      });
    }
  }

  return {
    version,
    instrument,
    selectedRunNumber,
    runs,
  };
}

// Import from a .trace file saved from Mac Instruments.app
export async function processInstrumentsProfile(
  file: File,
  zip: JSZip
): Promise<Profile | null> {
  const tree = await extractDirectoryTree(zip);
  const formTemplate = await readFormTemplate(tree);
  if (!formTemplate) {
    return null;
  }
  const { version, runs, instrument, selectedRunNumber } = formTemplate;
  if (instrument !== 'com.apple.xray.instrument-type.coresampler2') {
    throw new Error(
      `The only supported instrument from .trace import is "com.apple.xray.instrument-type.coresampler2". Got ${instrument}`
    );
  }
  console.log('version: ', version);
  console.log(`Importing time profile`);

  const profiles: Profile[] = [];
  let indexToView: number = 0;

  for (const run of runs) {
    const { addressToFrameMap, number } = run;
    const group = await importRunFromInstrumentsTrace({
      fileName: file.name,
      tree,
      addressToFrameMap,
      runNumber: number,
    });

    if (run.number === selectedRunNumber) {
      indexToView = profiles.length + group.indexToView;
    }

    profiles.push(...group.profiles);
  }

  // TODO - Actually import a profile.
  // return { name: file.name, indexToView, profiles };

  // This is just enough to not error when loading a profile.
  const profile = getEmptyProfile();
  profile.threads.push(getEmptyThread());
  return profile;
}

interface ProfileGroup {
  name: string;
  indexToView: number;
  profiles: Profile[];
}

export async function importRunFromInstrumentsTrace(args: {
  fileName: string,
  tree: TraceDirectoryTree,
  addressToFrameMap: Map<number, FrameInfo>,
  runNumber: number,
}): Promise<ProfileGroup> {
  const { fileName, tree, addressToFrameMap, runNumber } = args;
  const core = getCoreDirForRun(tree, runNumber);
  const samples = await getRawSampleList(core);
  const arrays = await getIntegerArrays(samples, core);

  // We'll try to guess which thread is the main thread by assuming
  // it's the one with the most samples.
  const sampleCountByThreadID = new Map<number, number>();
  for (const sample of samples) {
    sampleCountByThreadID.set(
      sample.threadID,
      getOrElse(sampleCountByThreadID, sample.threadID, () => 0) + 1
    );
  }
  const counts = Array.from(sampleCountByThreadID.entries());
  sortBy(counts, c => -c[1]);
  const threadIDs = counts.map(c => c[0]);

  return {
    name: fileName,
    indexToView: 0,
    profiles: threadIDs.map(threadID =>
      importThreadFromInstrumentsTrace({
        threadID,
        fileName,
        arrays,
        addressToFrameMap,
        samples,
      })
    ),
  };
}

class StackListProfileBuilder {
  constructor(..._args: any[]) {
    throw new Error('Speedscope StackListProfileBuilder is not imported.');
  }
}

export function importThreadFromInstrumentsTrace(args: {
  fileName: string,
  addressToFrameMap: Map<number, FrameInfo>,
  threadID: number,
  arrays: number[][],
  samples: Sample[],
}): Profile {
  const { fileName, addressToFrameMap, arrays, threadID } = args;
  let { samples } = args;

  const backtraceIDtoStack = new Map<number, FrameInfo[]>();
  samples = samples.filter(s => s.threadID === threadID);

  // TODO - The following parts of this function need to be implemented.
  // eslint-disable-next-line no-constant-condition
  if (true) {
    const profile: any = {};
    return profile;
  }

  const profile = new StackListProfileBuilder(
    ensureExists(lastOf(samples)).timestamp
  );
  profile.setName(`${fileName} - thread ${threadID}`);

  function appendRecursive(k: number, stack: FrameInfo[]) {
    const frame = addressToFrameMap.get(k);
    if (frame) {
      stack.push(frame);
    } else if (k in arrays) {
      for (const addr of arrays[k]) {
        appendRecursive(addr, stack);
      }
    } else {
      const rawAddressFrame: FrameInfo = {
        key: k,
        name: `0x${zeroPad(k.toString(16), 16)}`,
      };
      addressToFrameMap.set(k, rawAddressFrame);
      stack.push(rawAddressFrame);
    }
  }

  let lastTimestamp: null | number = null;
  for (const sample of samples) {
    const stackForSample = getOrInsert(
      backtraceIDtoStack,
      sample.backtraceID,
      id => {
        const stack: FrameInfo[] = [];
        appendRecursive(id, stack);
        stack.reverse();
        return stack;
      }
    );

    if (lastTimestamp === null) {
      // The first sample is sometimes fairly late in the profile for some reason.
      // We'll just say nothing was known to be on the stack in that time.
      profile.appendSampleWithWeight([], sample.timestamp);
      lastTimestamp = sample.timestamp;
    }

    if (sample.timestamp < lastTimestamp) {
      throw new Error('Timestamps out of order!');
    }

    profile.appendSampleWithWeight(
      stackForSample,
      sample.timestamp - lastTimestamp
    );
    lastTimestamp = sample.timestamp;
  }

  profile.setValueFormatter(new TimeFormatter('nanoseconds'));
  return profile.build();
}

export function readInstrumentsKeyedArchive(byteArray: Uint8Array) {
  const parsedPlist = parseBinaryPlist(byteArray);
  const data = expandKeyedArchive(parsedPlist, ($classname, object) => {
    switch ($classname) {
      case 'NSTextStorage':
      case 'NSParagraphStyle':
      case 'NSFont':
        // Stuff that's irrelevant for constructing a flamegraph
        return null;

      case 'PFTSymbolData': {
        const ret = Object.create(null);
        ret.symbolName = object.$0;
        ret.sourcePath = object.$1;
        ret.addressToLine = new Map<any, any>();
        for (let i = 3; ; i += 2) {
          const address = object['$' + i];
          const line = object['$' + (i + 1)];
          // Disabled since this is imported code, and it's a behavior change to rewrite it.
          // eslint-disable-next-line eqeqeq
          if (address == null || line == null) {
            break;
          }
          ret.addressToLine.set(address, line);
        }
        return ret;
      }

      case 'PFTOwnerData': {
        const ret = Object.create(null);
        ret.ownerName = object.$0;
        ret.ownerPath = object.$1;
        return ret;
      }

      case 'PFTPersistentSymbols': {
        const ret = Object.create(null);
        const symbolCount = object.$4;

        ret.threadNames = object.$3;
        ret.symbols = [];
        for (let i = 1; i < symbolCount; i++) {
          ret.symbols.push(object['$' + (4 + i)]);
        }
        return ret;
      }

      case 'XRRunListData': {
        const ret = Object.create(null);
        ret.runNumbers = object.$0;
        ret.runData = object.$1;
        return ret;
      }

      case 'XRIntKeyedDictionary': {
        const ret = new Map();
        const size = object.$0;
        for (let i = 0; i < size; i++) {
          const key = object['$' + (1 + 2 * i)];
          const value = object['$' + (1 + (2 * i + 1))];
          ret.set(key, value);
        }
        return ret;
      }

      case 'XRCore': {
        const ret = Object.create(null);
        ret.number = object.$0;
        ret.name = object.$1;
        return ret;
      }
      default:
        return object;
    }
  });
  return data;
}

////////////////////////////////////////////////////////////////////////////////

export function decodeUTF8(bytes: Uint8Array): string {
  // eslint-disable-next-line prefer-spread
  let text = String.fromCharCode.apply(String, Array.from(bytes));
  if (text.slice(-1) === '\0') {
    text = text.slice(0, -1);
  } // Remove a single trailing null character if present
  return decodeURIComponent(escape(text));
}

function isArray(value: any): boolean {
  return value instanceof Array;
}

function isDictionary(value: any): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === null
  );
}

function followUID(objects: any[], value: any): any {
  return value instanceof UID ? objects[value.index] : value;
}

function expandKeyedArchive(
  root: any,
  interpretClass: ($classname: string, obj: any) => any = x => x
): any {
  // Sanity checks
  if (
    root.$version !== 100000 ||
    root.$archiver !== 'NSKeyedArchiver' ||
    !isDictionary(root.$top) ||
    !isArray(root.$objects)
  ) {
    throw new Error('Invalid keyed archive');
  }

  // Substitute NSNull
  if (root.$objects[0] === '$null') {
    root.$objects[0] = null;
  }

  // Pattern-match Objective-C constructs
  for (let i = 0; i < root.$objects.length; i++) {
    root.$objects[i] = paternMatchObjectiveC(
      root.$objects,
      root.$objects[i],
      interpretClass
    );
  }

  // Reconstruct the DAG from the parse tree
  const visit = (object: any) => {
    if (object instanceof UID) {
      return root.$objects[object.index];
    } else if (isArray(object)) {
      for (let i = 0; i < object.length; i++) {
        object[i] = visit(object[i]);
      }
    } else if (isDictionary(object)) {
      for (const key in object) {
        object[key] = visit(object[key]);
      }
    } else if (object instanceof Map) {
      const clone = new Map(object);
      object.clear();
      for (const [k, v] of clone.entries()) {
        object.set(visit(k), visit(v));
      }
    }
    return object;
  };
  for (let i = 0; i < root.$objects.length; i++) {
    visit(root.$objects[i]);
  }
  return visit(root.$top);
}

function paternMatchObjectiveC(
  objects: any[],
  value: any,
  interpretClass: ($classname: string, obj: any) => any = x => x
): any {
  if (isDictionary(value) && value.$class) {
    const name = followUID(objects, value.$class).$classname;
    switch (name) {
      case 'NSDecimalNumberPlaceholder': {
        const length: number = value['NS.length'];
        const exponent: number = value['NS.exponent'];
        const byteOrder: number = value['NS.mantissa.bo'];
        const negative: boolean = value['NS.negative'];
        const mantissa = new Uint16Array(
          new Uint8Array(value['NS.mantissa']).buffer
        );
        let decimal = 0;

        for (let i = 0; i < length; i++) {
          let digit = mantissa[i];

          if (byteOrder !== 1) {
            // I assume this is how this works but I am unable to test it
            digit = ((digit & 0xff00) >> 8) | ((digit & 0x00ff) << 8);
          }

          decimal += digit * Math.pow(65536, i);
        }

        decimal *= Math.pow(10, exponent);
        return negative ? -decimal : decimal;
      }

      // Replace NSData with a Uint8Array
      case 'NSData':
      case 'NSMutableData':
        return value['NS.bytes'] || value['NS.data'];

      // Replace NSString with a string
      case 'NSString':
      case 'NSMutableString': {
        if (value['NS.string']) {
          return value['NS.string'];
        }
        if (value['NS.bytes']) {
          return decodeUTF8(value['NS.bytes']);
        }
        console.warn(`Unexpected ${name} format: `, value);
        return null;
      }
      // Replace NSArray with an Array
      case 'NSArray':
      case 'NSMutableArray': {
        if ('NS.objects' in value) {
          return value['NS.objects'];
        }
        const array: any[] = [];
        while (true) {
          const object = 'NS.object.' + array.length;
          if (!(object in value)) {
            break;
          }
          array.push(value[object]);
        }
        return array;
      }
      case '_NSKeyedCoderOldStyleArray': {
        const count = value['NS.count'];

        // const size = value['NS.size']
        // Types are encoded as single printable characters.
        // See: https://github.com/apple/swift-corelibs-foundation/blob/76995e8d3d8c10f3f3ec344dace43426ab941d0e/Foundation/NSObjCRuntime.swift#L19
        // const type = String.fromCharCode(value['NS.type'])

        const array: any[] = [];
        for (let i = 0; i < count; i++) {
          const element = value['$' + i];
          array.push(element);
        }
        return array;
      }
      case 'NSDictionary':
      case 'NSMutableDictionary': {
        const map = new Map();
        if ('NS.keys' in value && 'NS.objects' in value) {
          for (let i = 0; i < value['NS.keys'].length; i++) {
            map.set(value['NS.keys'][i], value['NS.objects'][i]);
          }
        } else {
          while (true) {
            const key = 'NS.key.' + map.size;
            const object = 'NS.object.' + map.size;
            if (!(key in value) || !(object in value)) {
              break;
            }
            map.set(value[key], value[object]);
          }
        }
        return map;
      }
      default: {
        const converted = interpretClass(name, value);
        if (converted !== value) {
          return converted;
        }
      }
    }
  }
  return value;
}

////////////////////////////////////////////////////////////////////////////////

class UID {
  index: number;
  constructor(index: number) {
    this.index = index;
  }
}

function parseBinaryPlist(bytes: Uint8Array): any {
  const text = 'bplist00';
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== text.charCodeAt(i)) {
      throw new Error('File is not a binary plist');
    }
  }
  return new BinaryPlistParser(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  ).parseRoot();
}

interface LengthAndOffset {
  length: number;
  offset: number;
}

// See http://opensource.apple.com/source/CF/CF-550/CFBinaryPList.c for details
class BinaryPlistParser {
  referenceSize = 0;
  objects: number[] = [];
  offsetTable: number[] = [];
  view: DataView;

  constructor(view: DataView) {
    this.view = view;
  }

  parseRoot(): any {
    const trailer = this.view.byteLength - 32;
    const offsetSize = this.view.getUint8(trailer + 6);
    this.referenceSize = this.view.getUint8(trailer + 7);

    // Just use the last 32-bits of these 64-bit big-endian values
    const objectCount = this.view.getUint32(trailer + 12, false);
    const rootIndex = this.view.getUint32(trailer + 20, false);
    let tableOffset = this.view.getUint32(trailer + 28, false);

    // Parse all offsets before starting to parse objects
    for (let i = 0; i < objectCount; i++) {
      this.offsetTable.push(this.parseInteger(tableOffset, offsetSize));
      tableOffset += offsetSize;
    }

    // Parse the root object assuming the graph is a tree
    return this.parseObject(this.offsetTable[rootIndex]);
  }

  parseLengthAndOffset(offset: number, extra: number): LengthAndOffset {
    if (extra !== 0x0f) {
      return { length: extra, offset: 0 };
    }
    const marker = this.view.getUint8(offset++);
    if ((marker & 0xf0) !== 0x10) {
      throw new Error('Unexpected non-integer length at offset ' + offset);
    }
    const size = 1 << (marker & 0x0f);
    return { length: this.parseInteger(offset, size), offset: size + 1 };
  }

  parseSingleton(offset: number, extra: number): any {
    if (extra === 0) {
      return null;
    }
    if (extra === 8) {
      return false;
    }
    if (extra === 9) {
      return true;
    }
    throw new Error('Unexpected extra value ' + extra + ' at offset ' + offset);
  }

  parseInteger(offset: number, size: number): number {
    if (size === 1) {
      return this.view.getUint8(offset);
    }
    if (size === 2) {
      return this.view.getUint16(offset, false);
    }
    if (size === 4) {
      return this.view.getUint32(offset, false);
    }

    if (size === 8) {
      return (
        Math.pow(2, 32 * 1) * this.view.getUint32(offset + 0, false) +
        Math.pow(2, 32 * 0) * this.view.getUint32(offset + 4, false)
      );
    }

    if (size === 16) {
      return (
        Math.pow(2, 32 * 3) * this.view.getUint32(offset + 0, false) +
        Math.pow(2, 32 * 2) * this.view.getUint32(offset + 4, false) +
        Math.pow(2, 32 * 1) * this.view.getUint32(offset + 8, false) +
        Math.pow(2, 32 * 0) * this.view.getUint32(offset + 12, false)
      );
    }

    throw new Error(
      'Unexpected integer of size ' + size + ' at offset ' + offset
    );
  }

  parseFloat(offset: number, size: number): number {
    if (size === 4) {
      return this.view.getFloat32(offset, false);
    }
    if (size === 8) {
      return this.view.getFloat64(offset, false);
    }
    throw new Error(
      'Unexpected float of size ' + size + ' at offset ' + offset
    );
  }

  parseDate(offset: number, size: number): Date {
    if (size !== 8) {
      throw new Error(
        'Unexpected date of size ' + size + ' at offset ' + offset
      );
    }
    const seconds = this.view.getFloat64(offset, false);
    return new Date(978307200000 + seconds * 1000); // Starts from January 1st, 2001
  }

  parseData(offset: number, extra: number): Uint8Array {
    const both = this.parseLengthAndOffset(offset, extra);
    return new Uint8Array(this.view.buffer, offset + both.offset, both.length);
  }

  parseStringASCII(offset: number, extra: number): string {
    const both = this.parseLengthAndOffset(offset, extra);
    let text = '';
    offset += both.offset;
    for (let i = 0; i < both.length; i++) {
      text += String.fromCharCode(this.view.getUint8(offset++));
    }
    return text;
  }

  parseStringUTF16(offset: number, extra: number): string {
    const both = this.parseLengthAndOffset(offset, extra);
    let text = '';
    offset += both.offset;
    for (let i = 0; i < both.length; i++) {
      text += String.fromCharCode(this.view.getUint16(offset, false));
      offset += 2;
    }
    return text;
  }

  parseUID(offset: number, size: number): UID {
    return new UID(this.parseInteger(offset, size));
  }

  parseArray(offset: number, extra: number): any[] {
    const both = this.parseLengthAndOffset(offset, extra);
    const array: any[] = [];
    const size = this.referenceSize;
    offset += both.offset;
    for (let i = 0; i < both.length; i++) {
      array.push(
        this.parseObject(this.offsetTable[this.parseInteger(offset, size)])
      );
      offset += size;
    }
    return array;
  }

  parseDictionary(offset: number, extra: number): ObjectMap<mixed> {
    const both = this.parseLengthAndOffset(offset, extra);
    const dictionary: ObjectMap<mixed> = Object.create(null);
    const size = this.referenceSize;
    let nextKey = offset + both.offset;
    let nextValue = nextKey + both.length * size;
    for (let i = 0; i < both.length; i++) {
      const key = this.parseObject(
        this.offsetTable[this.parseInteger(nextKey, size)]
      );
      const value = this.parseObject(
        this.offsetTable[this.parseInteger(nextValue, size)]
      );
      if (typeof key !== 'string') {
        throw new Error('Unexpected non-string key at offset ' + nextKey);
      }
      dictionary[key] = value;
      nextKey += size;
      nextValue += size;
    }
    return dictionary;
  }

  parseObject(offset: number): any {
    const marker = this.view.getUint8(offset++);
    const extra = marker & 0x0f;
    switch (marker >> 4) {
      case 0x0:
        return this.parseSingleton(offset, extra);
      case 0x1:
        return this.parseInteger(offset, 1 << extra);
      case 0x2:
        return this.parseFloat(offset, 1 << extra);
      case 0x3:
        return this.parseDate(offset, 1 << extra);
      case 0x4:
        return this.parseData(offset, extra);
      case 0x5:
        return this.parseStringASCII(offset, extra);
      case 0x6:
        return this.parseStringUTF16(offset, extra);
      case 0x8:
        return this.parseUID(offset, extra + 1);
      case 0xa:
        return this.parseArray(offset, extra);
      case 0xd:
        return this.parseDictionary(offset, extra);
      default:
        throw new Error(
          'Unexpected marker ' + marker + ' at offset ' + --offset
        );
    }
  }
}

type ValueUnit =
  | 'none'
  | 'nanoseconds'
  | 'microseconds'
  | 'milliseconds'
  | 'seconds'
  | 'bytes';

interface ValueFormatter {
  unit: ValueUnit;
  format(v: number): string;
}

class TimeFormatter implements ValueFormatter {
  multiplier: number;
  unit: ValueUnit;

  constructor(unit: ValueUnit) {
    if (unit === 'nanoseconds') {
      this.multiplier = 1e-9;
    } else if (unit === 'microseconds') {
      this.multiplier = 1e-6;
    } else if (unit === 'milliseconds') {
      this.multiplier = 1e-3;
    } else {
      this.multiplier = 1;
    }

    this.unit = unit;
  }

  formatUnsigned(v: number) {
    const s = v * this.multiplier;

    if (s / 60 >= 1) {
      const minutes = Math.floor(s / 60);
      const seconds = Math.floor(s - minutes * 60).toString();
      return `${minutes}:${zeroPad(seconds, 2)}`;
    }
    if (s / 1 >= 1) {
      return `${s.toFixed(2)}s`;
    }
    if (s / 1e-3 >= 1) {
      return `${(s / 1e-3).toFixed(2)}ms`;
    }
    if (s / 1e-6 >= 1) {
      return `${(s / 1e-6).toFixed(2)}µs`;
    }
    return `${(s / 1e-9).toFixed(2)}ns`;
  }

  format(v: number) {
    return `${v < 0 ? '-' : ''}${this.formatUnsigned(Math.abs(v))}`;
  }
}

function zeroPad(s: string, width: number) {
  return new Array(Math.max(width - s.length, 0) + 1).join('0') + s;
}

function getOrInsert<K, V>(map: Map<K, V>, k: K, fallback: (k: K) => V): V {
  let value = map.get(k);
  if (value === undefined) {
    value = fallback(k);
    map.set(k, value);
  }
  return value;
}

function getOrElse<K, V>(map: Map<K, V>, k: K, fallback: (k: K) => V): V {
  const value = map.get(k);
  if (value === undefined) {
    return fallback(k);
  }
  return value;
}

function getOrThrow<K, V>(map: Map<K, V>, k: K): V {
  const value = map.get(k);
  if (value === undefined) {
    throw new Error(`Expected key ${String(k)}`);
  }
  return value;
}

async function extractDirectoryTree(zip: JSZip): Promise<TraceDirectoryTree> {
  const tree: TraceDirectoryTree = {
    name: '',
    files: new Map(),
    subdirectories: new Map(),
  };

  for (const file of objectValues(zip.files)) {
    const parts = file.name
      // Split the directory into parts.
      .split('/')
      // Filter out any trailing empty strings. This can happen when a '/' is at the end
      // of a path.
      .filter(part => part !== '');

    let fileName = null;
    if (!file.dir) {
      fileName = parts.pop();
    }

    if (parts[0] === '__MACOSX') {
      // When zipping on macOS, some OS-only files are hidden away in this folder,
      // but the contents match the original directory structure. Remove that folder
      // name so the original files will match up.
      //
      // ├── Launch_inv_list.trace
      // │   └── Trace1.Run
      // │   └── ...
      // ├── __MACOSX
      // │   └── Launch_inv_list.trace
      // │       └── form.template
      parts.shift();
    }

    let node = tree;
    for (const part of parts) {
      node = getOrInsert(node.subdirectories, part, () => ({
        name: part,
        files: new Map(),
        subdirectories: new Map(),
      }));
    }

    if (fileName !== null) {
      node.files.set(fileName, file);
    }
  }

  if (tree.subdirectories.size === 1) {
    const subtree = ensureExists(getFirstItemFromMap(tree.subdirectories));
    if (subtree.name.endsWith('.trace')) {
      // This assumes the .trace folder is the root of the zip
      // ├── Launch_inv_list.trace
      // │   └── Trace1.Run
      // │   └── form.template
      // │   └── ...
      return subtree;
    }
  }

  // This assumes the directory contents of a .trace folder are zipped.
  // ├── Trace1.Run
  // ├── form.template
  // ├── ...
  return tree;
}

function sortBy<T>(ts: T[], key: (t: T) => number | string): void {
  function comparator(a: T, b: T) {
    const keyA = key(a);
    const keyB = key(b);
    // Disabled eslint rule as this is imported from speedscope.

    // $FlowFixMe - Cannot compare  number to string
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  }
  ts.sort(comparator);
}

function lastOf<T>(ts: T[]): T | null {
  return ts[ts.length - 1] || null;
}
