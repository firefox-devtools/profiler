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
import type {
  ObjectMap,
  Profile,
  Thread,
  Address,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  Tid,
  Pid,
} from 'firefox-profiler/types';
import { getEmptyProfile, getEmptyThread } from '../data-structures';

// This file contains methods to import data from OS X Instruments.app
// https://developer.apple.com/library/content/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/index.html

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

type IndexIntoSomeThreadStructure = number;
type IndexIntoArrays = number;

interface Sample {
  timestamp: number;
  threadId: IndexIntoSomeThreadStructure;
  backtraceId: IndexIntoArrays;
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

      // TODO(Greg) - I think this is wrong. In the example in the test this comes out
      // as the value 4. I suspect we actually need an index into the threadSerialNumbers.
      // In the example code, this value would be 0x00, which is hard to deduce.
      const threadId = bulkstore.readUint32();

      bulkstore.skip(bytesPerEntry - 6 - 4 - 4);
      const backtraceId = bulkstore.readUint32();
      samples.push({ timestamp, threadId, backtraceId });
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

type SymbolInfo = {|
  symbolName: string | null,
  sourcePath: string | null,
  addressToLine: Map<Address, number>,
|};

type SymbolsByPid = Map<Pid, { symbols: SymbolInfo[] }>;

async function convertInstrumentsProfile(
  tree: TraceDirectoryTree
): Promise<Profile> {
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

  const profile = getEmptyProfile();
  const otherCategory = profile.meta.categories.findIndex(
    category => category.name === 'Other'
  );
  if (otherCategory === -1) {
    throw new Error('Could not find the Other category.');
  }
  const otherSubCategory = profile.meta.categories[
    otherCategory
  ].subcategories.indexOf('Other');
  if (otherSubCategory === -1) {
    throw new Error('Could not find the Other subcategory.');
  }

  for (const runNumber of allRunData.runNumbers) {
    const runData = getOrThrow<number, Map<any, any>>(
      allRunData.runData,
      runNumber
    );

    const core = getCoreDirForRun(tree, runNumber);
    const samples = await getRawSampleList(core);
    const arrays = await getIntegerArrays(samples, core);

    // This is easier to type as an Object.
    const runDataObj: RunData = mapToObject(
      runData,
      // Keep the following as Map types:
      new Set([
        'symbolsByPid',
        'mach_time_info',
        'threadsByTID',
        'threadSerialNumbers',
      ])
    );

    console.log(
      'The runData object has all of the interesting data for the Instruments importer',
      runDataObj
    );
    console.log(
      'TODO - `threadsByTID` has the relevant thread information.',
      runDataObj.threadsByTID
    );
    console.log(
      'TODO - `threadSerialNumbers` I believe has the serialized thread ' +
        'information, which is stored in the sample information. Unfortunately, ' +
        'single-threaded data will always have a value of 0 for the index, which is ' +
        'hard to deduce from the sample data.',
      runDataObj.threadSerialNumbers
    );

    const symbolsByPid: SymbolsByPid = ensureExists(
      runData.get('symbolsByPid'),
      'Expected to find symbols information in the instruments profile, but none was found.'
    );

    // TODO(Greg) - The symbols are provided by PID, however, I don't have a way to map
    // back to the true thread index. This is somewhat broken from the speedscope
    // implementation. There is a risk that different PIDs share different addresses,
    // and the symbolication can get messed up. The fix here is to figure out the correct
    // thread offset in the sample. See the other TODO(Greg) notes.
    const addressToSymbol: Map<Address, SymbolInfo> = new Map();
    for (const { symbols } of symbolsByPid.values()) {
      for (const symbol of symbols) {
        for (const address of symbol.addressToLine.keys()) {
          addressToSymbol.set(address, symbol);
        }
      }
    }

    /* TODO
    for (const { tid, process } of runDataObj.threadsByTID.values()) {
      for (const { timestamp, threadId, backtraceId } of samples) {
        // The threadId is wrong. In the test data its value is 4. I suspect the sample
        // includes an index into the threadSerialNumbers. It would be good to record
        // a multi-threaded profile, and deduce where this information is in the sample.

        // TODO - Match the samples here.
      }
    }
    */

    const samplesByThreadId: Map<
      IndexIntoSomeThreadStructure,
      Sample[]
    > = new Map();
    for (const sample of samples) {
      let samples = samplesByThreadId.get(sample.threadId);
      if (!samples) {
        samples = [];
        samplesByThreadId.set(sample.threadId, samples);
      }
      samples.push(sample);
    }

    for (const samples of samplesByThreadId.values()) {
      const symbolToFuncIndex = new Map<string, IndexIntoFuncTable>();
      const thread = getEmptyThread();
      profile.threads.push(thread);
      const {
        frameTable,
        stringTable,
        stackTable,
        funcTable,
        samples: samplesTable,
      } = thread;

      // eslint-disable-next-line no-inner-declarations
      function getFuncIndex(
        address: Address,
        symbol?: SymbolInfo
      ): IndexIntoFuncTable {
        const sourcePath: string =
          symbol && symbol.sourcePath ? symbol.sourcePath : '';

        const symbolName: string =
          symbol && symbol.symbolName
            ? symbol.symbolName
            : `0x${zeroPad(address.toString(16), 16)}`;
        const key = `${sourcePath}:${symbolName}`;
        let funcIndex = symbolToFuncIndex.get(key);
        if (funcIndex === undefined) {
          funcTable.name.push(stringTable.indexForString(symbolName));
          funcTable.isJS.push(false);
          funcTable.relevantForJS.push(false);
          // TODO - Is this information here?
          funcTable.resource.push(-1);
          funcTable.fileName.push(
            sourcePath ? stringTable.indexForString(sourcePath) : null
          );
          funcIndex = funcTable.length++;
          symbolToFuncIndex.set(key, funcIndex);
        }
        return funcIndex;
      }

      for (const sample of samples) {
        const symbols: Array<void | SymbolInfo> = [];
        const addresses: Address[] = [];
        const idsOrAddresses: Array<Address | IndexIntoArrays> = [
          sample.backtraceId,
        ];

        // Walk from tip to root of the stack. The stack is composed of lists of different
        // addresses. An id here represents an index into the the integer arrays. For
        // some reason this information is split across different sections of the integers
        // array. Reconstruct the linear list from the tree data structure.
        //
        // Example:
        //
        // id
        // ├── id
        // │   ├── Address (tip)
        // │   ├── Address
        // │   └── Address
        // ├── id
        // │   ├── Address
        // │   ├── Address
        // │   ├── Address
        // │   └── Address
        // └── id
        //     ├── id
        //     │   ├── Address
        //     │   └── Address
        //     └── id
        //         ├── Address
        //         ├── Address
        //         └── Address (root)
        while (idsOrAddresses.length > 0) {
          const idOrAddress = idsOrAddresses.pop();
          if (idOrAddress in arrays) {
            // This is an index into array.
            const nextIdsOrAddresses = arrays[idOrAddress];

            // Add the next ids or addresses to the list to consider, but in reverse
            // order that they are listed.
            for (let i = 0; i < nextIdsOrAddresses.length; i++) {
              idsOrAddresses.push(
                nextIdsOrAddresses[nextIdsOrAddresses.length - i - 1]
              );
            }
          } else {
            // This is an address;
            const address = idOrAddress;
            symbols.push(addressToSymbol.get(address));
            addresses.push(address);
          }
        }

        // Convert the stack to the processed profile version.
        let stackIndex = -1;
        let prefix = null;
        while (symbols.length > 0) {
          debugger;
          const symbol = symbols.pop();
          const address = addresses.pop();
          const funcIndex = getFuncIndex(address, symbol);
          let frameIndex;
          for (
            // Increase the stackIndex by one. For the first run, this will end up
            // being a stackIndex of 0. For the consecutive runs, it will be the next
            // stack index.
            stackIndex++;
            stackIndex < stackTable.length;
            stackIndex++
          ) {
            frameIndex = stackTable.frame[stackIndex];
            if (
              frameTable.func[frameIndex] === funcIndex &&
              stackTable.prefix[stackIndex] === prefix
            ) {
              break;
            }
          }
          if (stackIndex === stackTable.length) {
            const line = symbol ? symbol.addressToLine.get(address) : null;

            frameTable.address.push(address);
            frameTable.category.push(otherCategory);
            frameTable.subcategory.push(otherSubCategory);
            frameTable.func.push(funcIndex);
            frameTable.innerWindowID.push(null);
            frameTable.implementation.push(null);
            frameTable.line.push(line === undefined ? null : line);
            frameTable.column.push(null);
            frameIndex = frameTable.length;
            frameTable.length++;

            stackTable.frame.push(frameIndex);
            stackTable.category.push(otherCategory);
            stackTable.category.push(otherSubCategory);
            stackTable.prefix.push(prefix);
            // The stack index already points to this spot.
            stackTable.length++;
          }

          prefix = stackIndex;
        }

        // Insert the sample.
        samplesTable.time.push(sample.timestamp);
        samplesTable.stack.push(stackIndex);
        samplesTable.length++;
      }
    }
  }

  return profile;
}

// Import from a .trace file saved from Mac Instruments.app
export async function processInstrumentsProfile(
  file: File,
  zip: JSZip
): Promise<Profile | null> {
  const tree = await extractDirectoryTree(zip);
  return convertInstrumentsProfile(tree);
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

      case 'XRThread': {
        // Without any of this manipulation, the data looks like this:
        // {
        //   $class: {
        //     $classname: 'XRThread',
        //     $classes: ['XRThread', 'NSObject'],
        //   },
        //   $0: Tid, // 63045358
        //   $1: {
        //     $class: {
        //       $classname: 'XRBacktraceTypeAdapter',
        //       $classes: ['XRBacktraceTypeAdapter', 'NSObject'],
        //     },
        //   },
        //   $2: null,
        //   $3: [],
        //   $4: {
        //     deviceIdentifier: 'E9A531DB-182F-5246-8FFF-605E33A88AD6'
        //     documentUUID: '1E5A5900-FF1A-43A9-9250-1C372500A3E9'
        //     overrideName: 'Main Thread  0x3c1feee'
        //     execIconName: 'device.E9A531DB-182F-5246-8FFF-605E33A88AD6.simple'
        //     coreValueSignature: 1
        //     execName: 'simple'
        //     pid: 26200
        //   },
        //   $5: 0,
        // }
        const ret = Object.create(null);
        ret.tid = object.$0;
        ret.process = object.$4;
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

/**
 * Recursively convert a Map data structure into an object. This makes it easier
 * to type the result of the instrument data.
 */
function mapToObject(
  mixed: any,
  keyAllowList = new Set(),
  prevKey: string = ''
): any {
  if (mixed instanceof Map) {
    // This is a map, see if it needs to be converted to an object.

    const map: Map<any, any> = mixed;
    if (keyAllowList.has(prevKey)) {
      // Don't convert this into an object, but do recurse into its child members.
      const newMap = new Map();
      for (const [key, value] of map) {
        newMap.set(key, mapToObject(value, keyAllowList, key));
      }
      return newMap;
    }

    // Convert the map into an Object.
    const object: any = {};
    for (const [key, value] of map) {
      object[key] = mapToObject(value, keyAllowList, key);
    }
    return object;
  }

  // If this is an array, recurse into the members.
  if (Array.isArray(mixed)) {
    return mixed.map(v => mapToObject(v, keyAllowList));
  }

  // If this is an object already, recurse into its members.
  if (mixed && typeof mixed === 'object') {
    const object = {};
    for (const [key2, value2] of Object.entries(mixed)) {
      object[key2] = mapToObject(value2, keyAllowList);
    }
    return object;
  }

  // This is a plain value, just return it.
  return mixed;
}

type SymbolsByPid2 = Map<
  Pid,
  {
    threadNames: string[], // [ 'Main Thread  0x3c1feee' ],
    symbols: Array<{
      symbolName: string, // 'szone_malloc_should_clear',
      sourcePath: string | null, // '/Users/jlfwong/code/speedscope/sample/cpp/simple.cpp',
      addressToLine: Map<Address, number>,
    }>,
  }
>;

type UnparsedClass<T: string> = {
  $classname: T,
  $classes: mixed,
};

type RunData = {
  symbolsByPid: SymbolsByPid2,
  // Map {
  //   'E9A531DB-182F-5246-8FFF-605E33A88AD6' => [ 2829117936992677, 1, 1 ]
  // },
  mach_time_info: Map<string, [number, number, number]>,
  recordingOptions: {
    windowLimit: number, // 0,
    timeLimit: number, // 43200000000000,
    supportsWindowedMode: boolean,
    supportsImmediateMode: boolean,
    $class: UnparsedClass<'XRRecordingOptions'>,
    recordingMode: 1,
    supportsDeferredMode: true,
  },
  serialThreadNumbers: { '0': 0x3c1feee },
  osVersion: {
    ProductBuildVersion: '16A323',
    ProductCopyright: '1983-2016 Apple Inc.',
    ProductVersion: '10.12',
    ProductName: 'Mac OS X',
    ProductUserVisibleVersion: '10.12',
  },
  numberOfCpus: number,
  log: mixed[],
  processDatas: [
    {
      specifiedEnvironment: {},
      _processProperties: mixed,
      imageData: [Uint8Array],
      _execname: '/Users/jlfwong/code/speedscope/sample/cpp/simple',
      _pid: 26200,
      bundleIdentifier: '/Users/jlfwong/code/speedscope/sample/cpp/simple',
      specifiedType: 0,
      _args: '',
      _launchControlProperties: mixed,
      deviceTemplateData: mixed,
    },
    {
      specifiedEnvironment: {},
      _execname: 'kernel_task',
      _pid: 0,
      processID: 0,
      specifiedType: 0,
      _launchControlProperties: {},
      imageData: [Uint8Array],
      deviceTemplateData: mixed,
    }
  ],
  // [ { number: 0, name: 'E9A531DB-182F-5246-8FFF-605E33A88AD6' }, ... ]
  allCores: Array<{ number: 0, name: string }>,
  // [
  //   "Target Name: Jamie's Macbook Pro",
  //   'Target Model: MacBook Pro',
  //   'Target macOS: 10.12 (16A323)',
  //   '',
  //   'Start Time: May 8, 2018, 10:10:57 PM',
  //   'End Time: May 8, 2018, 10:11:01 PM',
  //   'Duration: 4 seconds',
  //   '',
  //   'Instruments: 8.3.3 (8E3004b)'
  // ]
  recordingInfoSummary: string[],
  inspectionTime: number, // 4113218783
  target: {
    specifiedEnvironment: {},
    _processProperties: { plist: mixed[] },
    imageData: Uint8Array,
    _execname: '/Users/jlfwong/code/speedscope/sample/cpp/simple',
    _pid: 26200,
    bundleIdentifier: '/Users/jlfwong/code/speedscope/sample/cpp/simple',
    specifiedType: 0,
    _args: '',
    _launchControlProperties: {
      XRDeviceFileChooserWorkingDirectory: '',
      DisableTALAutomaticTermination: false,
      iODestinationKey: 0,
    },
    deviceTemplateData: {
      _deviceHostName: "Jamie's Macbook Pro",
      _deviceVersion: '16A323',
      _deviceIdentifier: 'E9A531DB-182F-5246-8FFF-605E33A88AD6',
      _productVersion: '10.12',
      _modelName: 'MacBook Pro',
      _xrdeviceClassName: 'XRLocalDevice',
      _rawDeviceDisplayName: "Jamie's Macbook Pro",
      _productType: 'MacBookPro11,3',
      _deviceDisplayName: "Jamie's Macbook Pro",
      _modelUTI: 'com.apple.macbookpro-15-retina-display',
      _deviceDescription: 'Jamies-Macbook-Pro',
      _deviceSmallRepresentationIcon: [Uint8Array],
    },
  },
  architecture: {
    $class: {
      $classname: 'XRArchitecture',
      $classes: ['XRArchitecture', 'NSObject'],
    },
    $0: 16777223,
    $1: 3,
  },
  threadSerialNumbers: Map<Pid, number>,
  // ['Target: simple', 'Recording Mode: Immediate', 'Time Limit: 12 hours', '']
  recordingSettingsSummary: string[],
  threadSerialMax: number,
  startTime: number, // 1525842657580993300
  runningTime: number, // 4113218784
  threadsByTID: Map<
    Tid,
    {
      tid: Tid, // 0x03c1feee,
      process: {
        deviceIdentifier: string, // 'E9A531DB-182F-5246-8FFF-605E33A88AD6'
        documentUUID: string, // '1E5A5900-FF1A-43A9-9250-1C372500A3E9'
        overrideName: string, // 'Main Thread  0x3c1feee'
        execIconName: string, // 'device.E9A531DB-182F-5246-8FFF-605E33A88AD6.simple'
        coreValueSignature: number, // 1
        execName: string, // 'simple'
        pid: Pid, // 0x6658,
      },
    }
  >,
};
