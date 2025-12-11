import { simpleperf_report_proto as report } from './proto/simpleperf_report';

import { PROCESSED_PROFILE_VERSION } from 'firefox-profiler/app-logic/constants';
import type { Milliseconds } from 'firefox-profiler/types/units';
import type {
  CategoryList,
  CategoryColor,
  FrameTable,
  FuncTable,
  IndexIntoCategoryList,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  IndexIntoResourceTable,
  IndexIntoStackTable,
  ProfileMeta,
  ResourceTable,
  RawSamplesTable,
  Profile,
  RawThread,
  RawStackTable,
} from 'firefox-profiler/types/profile';
import {
  getEmptyFuncTable,
  getEmptyResourceTable,
  getEmptyFrameTable,
  getEmptyRawStackTable,
  getEmptySamplesTable,
  getEmptyRawMarkerTable,
  getEmptyNativeSymbolTable,
  getEmptySourceTable,
} from 'firefox-profiler/profile-logic/data-structures';
import { StringTable } from 'firefox-profiler/utils/string-table';
import { ensureExists } from 'firefox-profiler/utils/types';
import {
  verifyMagic,
  SIMPLEPERF as SIMPLEPERF_MAGIC,
} from 'firefox-profiler/utils/magic';

import Long from 'long';

function toNumber(value: Long | number): number {
  if (Long.isLong(value)) {
    const longValue: Long = value;
    return longValue.toNumber();
  }

  return value;
}

function toMilliseconds(nanoseconds: number | Long): Milliseconds {
  return toNumber(nanoseconds) / 1000_000;
}

class Categories {
  static categoryList: CategoryList = [];

  static Other = this.createCategory('Other', 'grey');
  static Native = this.createCategory('Native', 'magenta');
  static Java = this.createCategory('Java', 'green');
  static System = this.createCategory('System', 'yellow');
  static Kernel = this.createCategory('Kernel', 'orange');

  static toJson(): CategoryList {
    return this.categoryList;
  }

  static createCategory(
    name: string,
    color: CategoryColor
  ): IndexIntoCategoryList {
    const index = this.categoryList.length;
    this.categoryList.push({ name, color, subcategories: ['Other'] });

    return index;
  }
}

class FirefoxResourceTable {
  strings: StringTable;

  resourceTable: ResourceTable = getEmptyResourceTable();
  resourcesMap: Map<number, IndexIntoResourceTable> = new Map();

  constructor(strings: StringTable) {
    this.strings = strings;
  }

  toJson(): ResourceTable {
    return this.resourceTable;
  }

  findOrAddResource(file: report.IFile): IndexIntoResourceTable {
    let resourceIndex = this.resourcesMap.get(file.id!);
    if (!resourceIndex) {
      this.resourceTable.lib.push(null);
      this.resourceTable.name.push(this.strings.indexForString(file.path!));
      this.resourceTable.host.push(null);
      this.resourceTable.type.push(1); // Library

      resourceIndex = this.resourceTable.length++;
      this.resourcesMap.set(file.id!, resourceIndex);
    }

    return resourceIndex;
  }
}

class FirefoxFuncTable {
  strings: StringTable;

  funcTable: FuncTable = getEmptyFuncTable();
  funcMap: Map<string, IndexIntoFuncTable> = new Map();

  constructor(strings: StringTable) {
    this.strings = strings;
  }

  toJson(): FuncTable {
    return this.funcTable;
  }

  findOrAddFunc(name: string, resourceIndex: number): IndexIntoFuncTable {
    const nameIndex = this.strings.indexForString(name);

    const mapKey = `${nameIndex}-${resourceIndex}`;

    let funcIndex = this.funcMap.get(mapKey);
    if (!funcIndex) {
      this.funcTable.name.push(nameIndex);
      this.funcTable.isJS.push(false);
      this.funcTable.relevantForJS.push(false);
      this.funcTable.resource.push(resourceIndex);
      this.funcTable.source.push(null);
      this.funcTable.lineNumber.push(null);
      this.funcTable.columnNumber.push(null);

      funcIndex = this.funcTable.length++;
      this.funcMap.set(mapKey, funcIndex);
    }

    return funcIndex;
  }
}

class FirefoxFrameTable {
  strings: StringTable;

  frameTable: FrameTable = getEmptyFrameTable();
  frameMap: Map<string, IndexIntoFrameTable> = new Map();

  constructor(strings: StringTable) {
    this.strings = strings;
  }

  toJson(): FrameTable {
    return this.frameTable;
  }

  findOrAddFrame(
    funcIndex: IndexIntoFuncTable,
    category: IndexIntoCategoryList
  ): IndexIntoFrameTable {
    const mapKey = `${funcIndex}-${category}`;

    let frameIndex = this.frameMap.get(mapKey);
    if (!frameIndex) {
      this.frameTable.address.push(-1);
      this.frameTable.inlineDepth.push(0);
      this.frameTable.category.push(category);
      this.frameTable.subcategory.push(0);
      this.frameTable.func.push(funcIndex);
      this.frameTable.nativeSymbol.push(null);
      this.frameTable.innerWindowID.push(null);
      this.frameTable.line.push(null);
      this.frameTable.column.push(null);

      frameIndex = this.frameTable.length++;
      this.frameMap.set(mapKey, frameIndex);
    }

    return frameIndex;
  }
}

class FirefoxSampleTable {
  strings: StringTable;

  stackTable: RawStackTable = getEmptyRawStackTable();
  stackMap: Map<string, IndexIntoStackTable> = new Map();

  constructor(strings: StringTable) {
    this.strings = strings;
  }

  toJson(): RawStackTable {
    return this.stackTable;
  }

  findOrAddStack(
    frameIndex: IndexIntoFrameTable,
    prefix: IndexIntoStackTable | null
  ): IndexIntoStackTable {
    const mapKey = `${frameIndex}-${prefix ?? 'null'}`;

    let stackIndex = this.stackMap.get(mapKey);
    if (!stackIndex) {
      this.stackTable.frame.push(frameIndex);
      this.stackTable.prefix.push(prefix);

      stackIndex = this.stackTable.length++;
      this.stackMap.set(mapKey, stackIndex);
    }

    return stackIndex;
  }
}

class FirefoxThread {
  name: string;
  isMainThread: boolean;

  tid: number;
  pid: number;

  strings: StringTable;

  sampleTable: RawSamplesTable = getEmptySamplesTable();

  stackTable: FirefoxSampleTable;
  frameTable: FirefoxFrameTable;
  funcTable: FirefoxFuncTable;
  resourceTable: FirefoxResourceTable;

  cpuClockEventId: number = -1;

  constructor(thread: report.IThread, stringTable: StringTable) {
    this.tid = thread.threadId!;
    this.pid = thread.processId!;

    this.isMainThread = thread.threadId === thread.processId;
    this.name = thread.threadName ?? '';

    this.strings = stringTable;

    this.stackTable = new FirefoxSampleTable(this.strings);
    this.frameTable = new FirefoxFrameTable(this.strings);
    this.funcTable = new FirefoxFuncTable(this.strings);
    this.resourceTable = new FirefoxResourceTable(this.strings);
  }

  toJson(): RawThread {
    return {
      processType: 'default',
      processStartupTime: 0,
      processShutdownTime: null,
      registerTime: 0,
      unregisterTime: null,
      pausedRanges: [],
      name: this.name,
      isMainThread: this.isMainThread,
      pid: this.pid.toString(),
      tid: this.tid,
      samples: this.sampleTable,
      markers: getEmptyRawMarkerTable(),
      stackTable: this.stackTable.toJson(),
      frameTable: this.frameTable.toJson(),
      funcTable: this.funcTable.toJson(),
      resourceTable: this.resourceTable.toJson(),
      nativeSymbols: getEmptyNativeSymbolTable(),
    };
  }

  enableCpuClock(cpuClockEventId: number): void {
    this.cpuClockEventId = cpuClockEventId;

    if (cpuClockEventId >= 0) {
      this.sampleTable.weight = [];
      this.sampleTable.weightType = 'tracing-ms';
    }
  }

  addSample(sample: report.ISample, fileMap: Map<number, report.IFile>): void {
    let prefixStackId: number | null = null;
    for (const frame of sample.callchain!.reverse()) {
      const file: report.IFile = fileMap.get(frame.fileId!)!;

      const resourceIndex = this.resourceTable.findOrAddResource(file);
      const methodName =
        frame.symbolId! >= 0
          ? file.symbol![frame.symbolId!]
          : `${file.path!.split(/[\\/]/).pop()}+0x${frame.vaddrInFile!.toString(16)}`;

      const funcIndex = this.funcTable.findOrAddFunc(methodName, resourceIndex);

      const filePath = file.path ?? '';
      // const fileInAppData = filePath.startsWith("/data/app/");
      const fileInSystem =
        filePath.startsWith('/apex/') ||
        filePath.startsWith('/system/') ||
        filePath.startsWith('/vendor/');

      let category: IndexIntoCategoryList = Categories.Other;
      if (filePath === '[kernel.kallsyms]' || filePath.endsWith('.ko')) {
        category = Categories.Kernel;
      } else if (filePath.endsWith('.so')) {
        category = fileInSystem ? Categories.System : Categories.Native;
      } else if (
        filePath === '[JIT app cache]' ||
        filePath.endsWith('.vdex') ||
        filePath.endsWith('.apk') ||
        filePath.endsWith('.jar') ||
        filePath.endsWith('.oat') ||
        filePath.endsWith('.odex')
      ) {
        const isJavaMethod =
          methodName.startsWith('java.') ||
          methodName.startsWith('javax.') ||
          methodName.startsWith('kotlin.') ||
          methodName.startsWith('kotlinx.') ||
          methodName.startsWith('dalvik.');
        const isAndroidMethod =
          methodName.startsWith('android.') ||
          methodName.startsWith('com.android.') ||
          methodName.startsWith('androidx.') ||
          methodName.startsWith('libcore.');
        category =
          fileInSystem || isAndroidMethod || isJavaMethod
            ? Categories.System
            : Categories.Java;
      }

      const frameIndex = this.frameTable.findOrAddFrame(funcIndex, category);

      prefixStackId = this.stackTable.findOrAddStack(frameIndex, prefixStackId);
    }

    this.sampleTable.stack.push(prefixStackId);
    ensureExists(this.sampleTable.time).push(toMilliseconds(sample.time ?? 0));

    if (this.sampleTable.weight) {
      const weight =
        this.cpuClockEventId >= 0 && sample.eventTypeId === this.cpuClockEventId
          ? toMilliseconds(sample.eventCount ?? 0)
          : 0;
      this.sampleTable.weight.push(weight);
    }

    this.sampleTable.length++;
  }
}

class FirefoxProfile {
  threads: FirefoxThread[] = [];
  threadMap: Map<number, FirefoxThread> = new Map();

  fileMap: Map<number, report.IFile> = new Map();

  eventTypes: string[] = [];
  cpuClockEventId: number = -1;

  appPackageName: string | null = null;
  sampleCount: number = 0;
  lostCount: number = 0;

  stringArray = [];
  stringTable = StringTable.withBackingArray(this.stringArray);

  toJson(): Profile {
    return {
      meta: this.getProfileMeta(),
      libs: [],
      shared: {
        stringArray: this.stringArray,
        sources: getEmptySourceTable(),
      },
      threads: this.threads.map((thread) => thread.toJson()),
    };
  }

  getProfileMeta(): ProfileMeta {
    return {
      // The interval at which the threads are sampled.
      interval: 0,
      startTime: 0,
      processType: 0,
      categories: Categories.toJson(),
      product: this.appPackageName ?? 'Android Profile',
      stackwalk: 0,
      // This is the Gecko profile format version (the unprocessed version received directly
      // from the browser.)
      version: 30,
      // This is the processed profile format version.
      preprocessedProfileVersion: PROCESSED_PROFILE_VERSION,

      symbolicationNotSupported: true,
      markerSchema: [],

      platform: 'Android',
      toolkit: 'android',
      importedFrom: 'Simpleperf',

      // Do not distinguish between different stack types?
      usesOnlyOneStackType: true,
      // Hide the "Look up the function name on Searchfox" menu entry?
      sourceCodeIsNotOnSearchfox: true,
      // Extra information about the profile, not shown in the "Profile Info" panel,
      // but in the more info panel
      extra: [
        {
          label: 'Profile Information',
          entries: [
            {
              label: 'Sample Count',
              format: 'integer',
              value: this.sampleCount,
            },
            {
              label: 'Lost Samples',
              format: 'integer',
              value: this.lostCount,
            },
            {
              label: 'Sampled events',
              format: 'list',
              value: this.eventTypes,
            },
          ],
        },
      ],
      // Keep the defined thread order
      keepProfileThreadOrder: true,
    };
  }

  setMetaInfo(metaInfo: report.IMetaInfo | null) {
    this.eventTypes = metaInfo?.eventType ?? [];
    this.appPackageName = metaInfo?.appPackageName ?? null;

    this.cpuClockEventId =
      (this.eventTypes && this.eventTypes.indexOf('cpu-clock')) ?? -1;
  }

  setLostSituation(lost: report.ILostSituation | null) {
    this.sampleCount = toNumber(lost?.sampleCount ?? 0);
    this.lostCount = toNumber(lost?.lostCount ?? 0);
  }

  addFile(file: report.IFile) {
    this.fileMap.set(file.id!, file);
  }

  addThread(thread: report.IThread) {
    const firefoxThread = new FirefoxThread(thread, this.stringTable);
    this.threads.push(firefoxThread);
    this.threadMap.set(thread.threadId!, firefoxThread);
  }

  finalizeThreads() {
    this.threads.forEach((thread) => {
      thread.enableCpuClock(this.cpuClockEventId ?? -1);
    });
  }

  addSample(sample: report.ISample): void {
    const thread = this.threadMap.get(sample.threadId!);

    if (!thread) {
      console.warn(`Thread not found for sample: ${sample.threadId}`);
      return;
    }

    thread.addSample(sample, this.fileMap);
  }
}

export class SimpleperfReportConverter {
  buffer: Uint8Array;
  bufferView: DataView;
  bufferOffset: number = 0;

  constructor(buffer: Uint8Array) {
    this.buffer = buffer;
    this.bufferView = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
  }

  readUint16LE() {
    const value = this.bufferView.getUint16(
      this.bufferOffset,
      true /* littleEndian */
    );
    this.bufferOffset += 2;
    return value;
  }

  readUint32LE() {
    const value = this.bufferView.getUint32(
      this.bufferOffset,
      true /* littleEndian */
    );
    this.bufferOffset += 4;
    return value;
  }

  readMagic() {
    if (!verifyMagic(SIMPLEPERF_MAGIC, this.buffer)) {
      throw new Error('Invalid simpleperf file');
    }
    this.bufferOffset += SIMPLEPERF_MAGIC.length;
  }

  readRecord(recordSize: number): report.Record {
    const recordArray = this.buffer.subarray(
      this.bufferOffset,
      this.bufferOffset + recordSize
    );
    this.bufferOffset += recordSize;

    return report.Record.decode(recordArray);
  }

  process(): Profile {
    this.readMagic();

    // Parse version
    this.readUint16LE();

    let recordSize = this.readUint32LE();

    const targetProfile = new FirefoxProfile();

    const samples: report.ISample[] = [];
    let sampleCount = 0;

    while (recordSize > 0) {
      const record: report.Record = this.readRecord(recordSize);

      switch (record.recordData) {
        case 'sample':
          samples.push(record.sample!);
          break;
        case 'lost':
          // Expected only once
          sampleCount = toNumber(record.lost?.sampleCount ?? 0);
          targetProfile.setLostSituation(record.lost!);
          break;
        case 'file':
          targetProfile.addFile(record.file!);
          break;
        case 'thread':
          targetProfile.addThread(record.thread!);
          break;
        case 'metaInfo':
          // Expected only once
          targetProfile.setMetaInfo(record.metaInfo!);
          break;
        case 'contextSwitch':
          // Not handled
          break;
        default:
          console.warn(`Unknown record type: ${record.recordData}`);
          break;
      }

      recordSize = this.readUint32LE();
    }

    if (samples.length !== sampleCount) {
      throw new Error("Samples count doesn't match the number of samples read");
    }

    targetProfile.finalizeThreads();
    samples.forEach((sample) => targetProfile.addSample(sample));

    return targetProfile.toJson();
  }
}

export function convertSimpleperfTraceProfile(
  traceBuffer: Uint8Array
): Profile {
  return new SimpleperfReportConverter(traceBuffer).process();
}
