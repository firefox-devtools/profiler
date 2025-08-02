/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// Parses the ART trace format and converts it to the Gecko profile format.

// These profiles are obtained from Android in two ways:
//  - Programmatically, from the Debug API: https://developer.android.com/studio/profile/cpu-profiler#debug-api
//  - Or via the profiler UI in Android Studio.
//
// There is a "streaming" format and a regular format. In practice, it seems that
// profiles from the Debug API use the regular format and profiles saved from
// Android Studio's profiler UI use the streaming format.
// Orthogonally to the two formats, these traces can be based on either sampling
// or method tracing.
//
// The parsing code below was written with help from these resources:
// https://stuff.mit.edu/afs/sipb/project/android/docs/tools/debugging/debugging-tracing.html
// https://android.googlesource.com/platform/tools/base/+/studio-master-dev/perflib/src/main/java/com/android/tools/perflib/vmtrace/VmTraceParser.java
//
// The output will be an object of the Gecko profile format of a fixed old version.
// It will then go through the profile upgrading pipeline. This means that this
// importer does not need to be updated when the profile format changes.

// The type definitions below are very coarse and just enough to catch the
// biggest mistakes.
type GeckoThreadVersion11 = {
  tid: number;
  pid: number;
  name: string;
  registerTime: number;
  unregisterTime: number | null;
  // eslint-disable-next-line flowtype/no-weak-types
  markers: Object;
  // eslint-disable-next-line flowtype/no-weak-types
  samples: Object;
  // eslint-disable-next-line flowtype/no-weak-types
  frameTable: Object;
  // eslint-disable-next-line flowtype/no-weak-types
  stackTable: Object;
  stringTable: string[];
};
type GeckoCategoryVersion11 = {
  name: string;
  color: string;
};
type GeckoProfileVersion11 = {
  meta: {
    version: 11;
    interval: number;
    processType: 0;
    product: string;
    pid?: string;
    stackwalk: 1;
    startTime: number;
    shutdownTime: null;
    presymbolicated: true;
    categories: GeckoCategoryVersion11[];
  };
  // eslint-disable-next-line flowtype/no-weak-types
  libs: Object[];
  threads: GeckoThreadVersion11[];
  // eslint-disable-next-line flowtype/no-weak-types
  processes: Object[];
  // eslint-disable-next-line flowtype/no-weak-types
  pausedRanges: Object[];
};

// From VmTraceParser.java:
const TRACE_MAGIC = 0x574f4c53; // 'SLOW'

const PARSE_METHOD = 1;
const PARSE_THREAD = 2;
const PARSE_SUMMARY = 3;

const STREAMING_TRACE_VERSION_MASK = 0xf0;

const METHOD_ACTION_MASK = 0x03;
const METHOD_ID_MASK = ~0x03;

const lineBreakByte = '\n'.charCodeAt(0);

class ByteReader {
  _decoder: TextDecoder;
  _u8View: Uint8Array;
  _dataView: DataView;
  _pos: number;

  constructor(u8Array: Uint8Array) {
    this._decoder = new TextDecoder('utf-8', { fatal: true });
    this._u8View = u8Array;
    this._dataView = new DataView(this._u8View.buffer);
    this._pos = 0;
  }

  eof() {
    return this._pos >= this._u8View.length;
  }

  curPos() {
    return this._pos;
  }

  setCurPos(newPos: number) {
    this._pos = newPos;
  }

  getU8() {
    const val = this._dataView.getUint8(this._pos);
    this._pos += 1;
    return val;
  }

  getU16() {
    const val = this._dataView.getUint16(this._pos, true);
    this._pos += 2;
    return val;
  }

  getU32() {
    const val = this._dataView.getUint32(this._pos, true);
    this._pos += 4;
    return val;
  }

  getU64() {
    const low = this.getU32();
    const high = this.getU32();
    return high * Math.pow(2, 32) + low;
  }

  getBytesUntil(endPos: number) {
    if (endPos < this._pos) {
      throw new Error(
        `getBytesUntil() called with a target position in the past (curPos: ${this._pos}, endPos: ${endPos})`
      );
    }
    const buffer = this._u8View.subarray(this._pos, endPos);
    this._pos = endPos;
    return buffer;
  }

  getBytes(byteCount: number) {
    return this.getBytesUntil(this._pos + byteCount);
  }

  getString(byteLength: number) {
    const stringBytes = this.getBytes(byteLength);
    return this._decoder.decode(stringBytes);
  }

  // Returns the line without the line break at the end, but advances the
  // position to after the line break.
  getLine() {
    let nextLineBreak = this._u8View.indexOf(lineBreakByte, this._pos);
    if (nextLineBreak === -1) {
      nextLineBreak = this._u8View.length;
    }
    const line = this._u8View.subarray(this._pos, nextLineBreak);
    this._pos = nextLineBreak + 1;
    return this._decoder.decode(line);
  }
}

type ArtTraceThread = {
  tid: number;
  threadName: string;
};

export type ArtTraceMethod = {
  methodId: number;
  className: string;
  methodName: string;
  signature: string;
};

type ArtTrace = {
  summaryDetails: {
    clock: string;
    pid?: string;
  };
  startTimeInUsecSinceBoot: number;
  threads: ArtTraceThread[];
  methods: ArtTraceMethod[];
  methodActions: {
    tid: number;
    methodId: number;
    globalTime: number;
    threadTime: number;
    action: 'enter' | 'exit' | 'exit-unroll';
  }[];
};

function detectArtTraceFormat(
  traceBuffer: ArrayBuffer
): 'regular' | 'streaming' | 'unrecognized' {
  try {
    const lengthOfExpectedFirstTwoLinesOfSummarySection = '*version\nX\n'
      .length;
    const firstTwoLinesBuffer = traceBuffer.slice(
      0,
      lengthOfExpectedFirstTwoLinesOfSummarySection
    );
    const decoder = new TextDecoder();
    const firstTwoLinesString = decoder.decode(firstTwoLinesBuffer);
    if (/\*version\n[1-3]\n/.test(firstTwoLinesString)) {
      return 'regular';
    }
  } catch (e) {
    // Ignore exception and fall through
  }

  try {
    const dataView = new DataView(traceBuffer);
    const magic = dataView.getUint32(0, true);
    if (magic === TRACE_MAGIC) {
      return 'streaming';
    }
  } catch (e) {
    // Ignore exception and fall through
  }

  return 'unrecognized';
}

function validateMagicHeader(magicHeader: number) {
  if (magicHeader !== TRACE_MAGIC) {
    const expectedString = `0x${TRACE_MAGIC.toString(16)}`;
    const gotString = `0x${magicHeader.toString(16)}`;
    throw new Error(
      `Unexpected magic header, expected ${expectedString} (little endian), got ${gotString}`
    );
  }
}
function validateVersion(version: number) {
  if (version < 1 || version > 3) {
    throw new Error(
      `This code only knows how to parse versions 1 to 3, got version ${version}.`
    );
  }
}

function validateMatchingVersions(version: number, summaryVersion: number) {
  if (version !== summaryVersion) {
    throw new Error(
      `Error: version number mismatch; got ${summaryVersion} in summary but ${version} in data section`
    );
  }
}

function parseSummary(reader: ByteReader) {
  // Example:
  //
  // *version
  // 3
  // data-file-overflow=false
  // clock=dual
  // elapsed-time-usec=8758407
  // num-method-calls=35489
  // clock-call-overhead-nsec=3424
  // vm=art
  // pid=15355

  let line = reader.getLine();
  if (line !== '*version') {
    throw new Error('Expected *version, got ' + line);
  }
  const summaryVersion = +reader.getLine();
  validateVersion(summaryVersion);

  const summaryDetails = { summaryVersion, clock: 'thread-cpu' };
  while (true) {
    line = reader.getLine();
    if (!line || line.startsWith('*')) {
      break;
    }
    const [headerInfoLabel, headerInfoValue] = line.split('=');
    (summaryDetails as any)[headerInfoLabel] = headerInfoValue;
  }
  return { summaryVersion, summaryDetails, lineAfterSummary: line };
}

function parseThreads(reader: ByteReader) {
  // Example:
  //
  // *threads
  // 15385	SharedPreferencesImpl-load
  // 15431	EGL Init
  // 15355	main
  // 15360	Jit thread pool worker thread 0
  // 15361	Signal Catcher
  // 15362	ReferenceQueueDaemon
  // 15363	FinalizerDaemon
  // 15364	FinalizerWatchdogDaemon

  const threads = [];
  let line = '';
  while (true) {
    line = reader.getLine();
    if (!line || line.startsWith('*')) {
      break;
    }
    const [tid, threadName] = line.split('\t');
    threads.push({ tid: +tid, threadName });
  }
  return { threads, lineAfterThreads: line };
}

function parseOneMethod(s: string) {
  // Example:
  // 0x3f4	android.view.Window	adjustLayoutParamsForSubWindow	(Landroid/view/WindowManager$LayoutParams;)V	Window.java
  const [methodId, className, methodName, signature] = s.split('\t');
  return { methodId: +methodId, className, methodName, signature };
}

function parseMethods(reader: ByteReader) {
  // Example:
  //
  // *methods
  // 0x2ac	java.lang.BootClassLoader	findClass	(Ljava/lang/String;)Ljava/lang/Class;	ClassLoader.java
  // 0x2990	java.lang.BootClassLoader	findResources	(Ljava/lang/String;)Ljava/util/Enumeration;	ClassLoader.java
  // 0x298c	java.lang.BootClassLoader	getResources	(Ljava/lang/String;)Ljava/util/Enumeration;	ClassLoader.java

  const methods = [];
  let line = '';
  while (true) {
    line = reader.getLine();
    if (!line || line.startsWith('*')) {
      break;
    }
    methods.push(parseOneMethod(line));
  }
  return { methods, lineAfterMethods: line };
}

function parseRecordSize(reader: ByteReader, version: number) {
  switch (version) {
    case 1:
      return 9;
    case 2:
      return 10;
    default:
      return reader.getU16();
  }
}

function parseRecord(
  reader: ByteReader,
  version: number,
  recordSize: number,
  clock: string
) {
  const recordStart = reader.curPos();
  const tid = version === 1 ? reader.getU8() : reader.getU16();
  const methodIdAndAction = reader.getU32();
  const methodId = methodIdAndAction & METHOD_ID_MASK;
  const action = methodIdAndAction & METHOD_ACTION_MASK;
  if (action > 2) {
    throw new Error('Unexpected method action ' + action);
  }

  let globalTime, threadTime;
  switch (clock) {
    case 'wall':
      globalTime = reader.getU32();
      threadTime = globalTime;
      break;
    case 'dual':
      threadTime = reader.getU32();
      globalTime = reader.getU32();
      break;
    case 'thread-cpu':
    default:
      threadTime = reader.getU32();
      globalTime = threadTime;
      break;
  }

  reader.setCurPos(recordStart + recordSize);

  return {
    tid,
    methodId,
    globalTime,
    threadTime,
    action: ['enter', 'exit', 'exit-unroll'][action] as
      | 'enter'
      | 'exit'
      | 'exit-unroll',
  };
}

function parseRegularFormat(reader: ByteReader) {
  // *version
  const { summaryVersion, summaryDetails, lineAfterSummary } =
    parseSummary(reader);

  // *threads
  if (lineAfterSummary !== '*threads') {
    throw new Error('Expected *threads, got ' + lineAfterSummary);
  }
  const { threads, lineAfterThreads } = parseThreads(reader);

  // *methods
  if (lineAfterThreads !== '*methods') {
    throw new Error('Expected *methods, got ' + lineAfterThreads);
  }
  const { methods, lineAfterMethods } = parseMethods(reader);

  // *end
  if (lineAfterMethods !== '*end') {
    throw new Error('Expected *end, got ' + lineAfterMethods);
  }

  // The next part is binary.
  const headerStart = reader.curPos();
  const magic = reader.getU32();
  validateMagicHeader(magic);
  const version = reader.getU16();
  validateMatchingVersions(version, summaryVersion);

  const headerSize = reader.getU16();
  const startTimeInUsecSinceBoot = reader.getU64();
  const recordSize = parseRecordSize(reader, version);
  reader.setCurPos(headerStart + headerSize);

  const { clock } = summaryDetails;
  const methodActions = [];
  while (!reader.eof()) {
    methodActions.push(parseRecord(reader, version, recordSize, clock));
  }

  return {
    summaryDetails,
    threads,
    methods,
    methodActions,
    startTimeInUsecSinceBoot,
  };
}

function parseStreamingFormat(reader: ByteReader) {
  // The "streaming" format interleaves method declarations and thread
  // declarations with the method actions that refer to them. This is different
  // from the regular format, which collects all methods and threads and neatly
  // lists them in the text part of the format.
  // The streaming format is entirely binary, with embedded strings.

  // Parse header.
  const headerStart = reader.curPos();
  const magic = reader.getU32();
  validateMagicHeader(magic);
  const version = reader.getU16() ^ STREAMING_TRACE_VERSION_MASK;
  validateVersion(version);
  const headerSize = reader.getU16();
  const startTimeInUsecSinceBoot = reader.getU64();
  const recordSize = parseRecordSize(reader, version);
  reader.setCurPos(headerStart + headerSize);

  // Parse contents.
  const methods = [];
  const threads = [];
  const recordStartPositions = [];
  let summaryDetails = { clock: 'thread-cpu' };
  while (!reader.eof()) {
    const recordStart = reader.curPos();
    const nonZeroRecordFragmentOrZero = reader.getU16();

    if (nonZeroRecordFragmentOrZero !== 0) {
      // A normal record. Store its position so that we can parse it later.
      // We cannot parse it now because we need the clock information, which is
      // located in the summary section at the end of the file.
      recordStartPositions.push(recordStart);
      reader.setCurPos(recordStart + recordSize);
      continue;
    }

    // nonZeroRecordFragmentOrZero being 0 indicates a special action, which is
    // identified by the code in the next byte.
    const code = reader.getU8();
    if (code === PARSE_METHOD) {
      // Parse one method.
      const methodStringLength = reader.getU16();
      methods.push(parseOneMethod(reader.getString(methodStringLength)));
    } else if (code === PARSE_THREAD) {
      // Parse one thread.
      const tid = reader.getU16();
      const threadNameLength = reader.getU16();
      const threadName = reader.getString(threadNameLength);
      threads.push({ tid, threadName });
    } else if (code === PARSE_SUMMARY) {
      // Parse the entire summary section, and exit this loop.
      const summaryLength = reader.getU32();
      const summaryBytes = reader.getBytes(summaryLength);
      const summary = parseSummary(new ByteReader(summaryBytes));
      validateMatchingVersions(version, summary.summaryVersion);
      summaryDetails = summary.summaryDetails;
      break;
    } else {
      throw new Error(`Invalid trace format: got invalid code ${code}.`);
    }
  }

  // Now that we have the "clock" information from the summary section, read the
  // records from earlier in the file.
  const { clock } = summaryDetails;
  const methodActions = [];
  for (const recordStart of recordStartPositions) {
    reader.setCurPos(recordStart);
    methodActions.push(parseRecord(reader, version, recordSize, clock));
  }

  return {
    summaryDetails,
    threads,
    methods,
    methodActions,
    startTimeInUsecSinceBoot,
  };
}

function parseArtTrace(buffer: ArrayBuffer): ArtTrace {
  try {
    const reader = new ByteReader(new Uint8Array(buffer));
    switch (detectArtTraceFormat(buffer)) {
      case 'regular':
        return parseRegularFormat(reader);
      case 'streaming':
        return parseStreamingFormat(reader);
      default:
        throw new Error('Not an ART trace');
    }
  } catch (e) {
    console.error('Source exception:', e);
    throw new Error(
      `Could not parse the profile array buffer as an ART trace: ${e}`
    );
  }
}

// ART traces can be based on either sampling or method tracing:
//  - Method tracing means that, every time any method is entered or exited,
//    a timestamp is taken, and the enter/exit is recorded.
//  - Sampling obtains stacks at a fixed sampling rate, usually based on wall
//    clock time.
// There is no property in the trace that lets us know which of the two was used
// when this profile was obtained; the format makes both look like method
// tracing. So we resort to measuring deltas between the timestamps on the
// method actions: In sampling-based profiles, those timestamps are the original
// sample timestamps. A sample that changes the current stack will cause a whole
// bunch of methods to be exited and entered "simultaneously", i.e. with the
// same timestamp.
//
// This function returns the average of the lowest 20% of timestamp deltas that
// can be observed among the first 500 method actions.
function procureSamplingInterval(trace: ArtTrace) {
  const { methodActions } = trace;

  // Gather up to 500 time deltas between method actions on a thread.
  const deltas: number[] = [];
  const previousTimestampByThread = new Map();
  const numberOfActionsToConsider = Math.min(500, methodActions.length);
  for (let i = 0; i < numberOfActionsToConsider; i++) {
    const { tid, globalTime } = methodActions[i];
    const previousTimestamp = previousTimestampByThread.get(tid);
    if (globalTime !== previousTimestamp) {
      if (previousTimestamp !== undefined) {
        const delta = globalTime - previousTimestamp;
        deltas.push(delta);
      }
      previousTimestampByThread.set(tid, globalTime);
    }
  }

  // Return the average of the lowest 20% of deltas.
  deltas.sort((a, b) => a - b);
  if (deltas.length < 5) {
    return deltas[0];
  }
  const deltasThatMatter = deltas.slice(0, Math.floor(deltas.length / 5));
  const avg =
    deltasThatMatter.reduce((prev, cur) => prev + cur, 0) /
    deltasThatMatter.length;
  return avg;
}

export type SpecialCategoryInfo = {
  prefixes: string[];
  name: string;
};

// Make a category for a frequently-encountered bag of code that is not covered
// by the other categories in the category list.
// In practice, for profiles obtained from Fenix, we want this to return a
// "Mozilla" category for methods on "org.mozilla.*" or "mozilla.*" classes.
// This is probably a bit overengineered. But on the plus side, it should work
// for non-mozilla code, too.
export function getSpecialCategory(
  methods: ArtTraceMethod[]
): SpecialCategoryInfo | void {
  function getSignificantNamespaceSegment(className: string) {
    // Cut off leading "org." or "com.". Those are boring.
    const s =
      className.startsWith('org.') || className.startsWith('com.')
        ? className.substring(4)
        : className;

    // Return the first segment of the remainder.
    const firstPeriodPos = s.indexOf('.');
    if (firstPeriodPos === -1) {
      return s;
    }
    return s.substring(0, firstPeriodPos);
  }

  const significantSegmentCounter = new Map();
  for (let i = 0; i < methods.length; i++) {
    const significantSegment = getSignificantNamespaceSegment(
      methods[i].className
    );
    switch (significantSegment) {
      case 'android':
      case 'java':
      case 'sun':
      case 'kotlin':
      case 'androidx':
      case 'kotlinx':
        // These are covered by existing categories and not "special".
        break;
      default: {
        const count = significantSegmentCounter.get(significantSegment) || 0;
        significantSegmentCounter.set(significantSegment, count + 1);
      }
    }
  }
  const significantSegmentCounts = Array.from(
    significantSegmentCounter.entries()
  );
  if (significantSegmentCounts.length === 0) {
    return undefined;
  }
  // Find the most used "significant segment" by sorting and taking the first element.
  significantSegmentCounts.sort(([_s1, c1], [_s2, c2]) => c2 - c1);
  const [specialSegment] = significantSegmentCounts[0];
  // In the Fenix profiles I've tested with, specialSegment is now "mozilla".

  return {
    prefixes: [
      `${specialSegment}.`,
      `com.${specialSegment}.`,
      `org.${specialSegment}.`,
    ],
    name: specialSegment[0].toUpperCase() + specialSegment.slice(1), // mozilla -> Mozilla
  };
}

export class CategoryInfo {
  idleCategory = 0;
  otherCategory = 1;
  blockingCategory = 2;
  androidCategory = 3;
  javaCategory = 4;
  kotlinCategory = 5;
  androidxCategory = 6;
  specialCategory = 7;
  categories: GeckoCategoryVersion11[] = [
    {
      name: 'Idle',
      color: 'transparent',
    },
    {
      name: 'Other',
      color: 'grey',
    },
    {
      name: 'Blocked',
      color: 'lightblue',
    },
    {
      name: 'Android',
      color: 'yellow',
    },
    {
      name: 'Java',
      color: 'blue',
    },
    {
      name: 'Kotlin / KotlinX',
      color: 'purple',
    },
    {
      name: 'AndroidX',
      color: 'orange',
    },
    {
      name: 'Special',
      color: 'green',
    },
  ];

  _specialCategoryInfo: SpecialCategoryInfo | void;

  constructor(methods: ArtTraceMethod[]) {
    this._specialCategoryInfo = getSpecialCategory(methods);
    if (this._specialCategoryInfo) {
      this.categories[this.specialCategory].name =
        this._specialCategoryInfo.name;
    }
  }

  inferJavaCategory(name: string): number {
    if (name === 'android.os.MessageQueue.nativePollOnce') {
      return this.idleCategory;
    }
    if (name === 'java.lang.Object.wait') {
      return this.blockingCategory;
    }
    if (name.startsWith('android.') || name.startsWith('com.android.')) {
      return this.androidCategory;
    }
    if (
      name.startsWith('java.') ||
      name.startsWith('sun.') ||
      name.startsWith('com.sun.')
    ) {
      return this.javaCategory;
    }
    if (name.startsWith('kotlin.') || name.startsWith('kotlinx.')) {
      return this.kotlinCategory;
    }
    if (name.startsWith('androidx.')) {
      return this.androidxCategory;
    }
    if (
      this._specialCategoryInfo &&
      this._specialCategoryInfo.prefixes.some((prefix) =>
        name.startsWith(prefix)
      )
    ) {
      return this.specialCategory;
    }
    return this.otherCategory;
  }
}

class ThreadBuilder {
  _markers = {
    schema: {
      name: 0,
      time: 1,
      data: 2,
    },
    data: [],
  };
  _samples = {
    schema: {
      stack: 0,
      time: 1,
      responsiveness: 2,
      rss: 3,
      uss: 4,
    },
    data: [],
  };
  _frameTable = {
    schema: {
      location: 0,
      implementation: 1,
      optimizations: 2,
      line: 3,
      category: 4,
    },
    data: [],
  };
  _stackTable = {
    schema: {
      frame: 0,
      prefix: 1,
    },
    data: [],
  };
  _stringTable = [];

  _currentStack = null;
  _nextSampleTimestamp = 0;
  _stackMap = new Map();
  _frameMap = new Map();
  _registerTime = 0;
  _name;
  _pid;
  _tid;
  _methodMap;
  _intervalInMsec;
  _honorOriginalSamplingTimestamps;
  _categoryInfo;

  constructor(
    name: string,
    pid: number,
    tid: number,
    methodMap: Map<number, ArtTraceMethod>,
    intervalInMsec: number,
    honorOriginalSamplingTimestamps: boolean,
    categoryInfo: any
  ) {
    this._name = name;
    this._pid = pid;
    this._tid = tid;
    this._methodMap = methodMap;
    this._intervalInMsec = intervalInMsec;
    this._honorOriginalSamplingTimestamps = honorOriginalSamplingTimestamps;
    this._categoryInfo = categoryInfo;
  }

  _getOrCreateStack(frame: number, prefix: number | null) {
    const key = prefix === null ? `${frame}` : `${frame},${prefix}`;
    let stack = this._stackMap.get(key);
    if (stack === undefined) {
      stack = this._stackTable.data.length;
      (this._stackTable.data as any).push([frame, prefix]);
      this._stackMap.set(key, stack);
    }
    return stack;
  }

  _getOrCreateFrameForMethodId(methodId: number) {
    let frame = this._frameMap.get(methodId);
    if (frame === undefined) {
      const methodInfo = this._methodMap.get(methodId);
      let methodString;
      if (methodInfo === undefined) {
        // This can happen in practice. The Android Studio profiler shows
        // 'unknown' in that case.
        methodString = '<unknown method ID 0x' + methodId.toString(16) + '>';
      } else {
        const { className, methodName } = methodInfo;
        methodString = className + '.' + methodName;
      }
      const stringIndex = this._stringTable.length;
      (this._stringTable as any).push(methodString);
      const category = this._categoryInfo.inferJavaCategory(methodString);
      frame = this._frameTable.data.length;
      (this._frameTable.data as any).push([
        stringIndex,
        null,
        null,
        null,
        category,
      ]);
      this._frameMap.set(methodId, frame);
    }
    return frame;
  }

  enterMethod(methodId: number) {
    const frame = this._getOrCreateFrameForMethodId(methodId);
    this._currentStack = this._getOrCreateStack(frame, this._currentStack);
  }

  exitMethod(_methodId: number) {
    if (this._currentStack === null) {
      // This has been observed to happen in tracing-based traces (rather than sampling-based traces). Not sure why.
      // console.warn('exiting method when stack is empty');
      return;
    }
    this._currentStack = this._stackTable.data[this._currentStack][1];
  }

  // Called before enter/exitMethod are called for this time
  advanceTimeTo(timestampInMSSinceStartTime: number) {
    if (this._nextSampleTimestamp === 0) {
      this._nextSampleTimestamp = timestampInMSSinceStartTime;
      if (this._name !== 'main') {
        this._registerTime = timestampInMSSinceStartTime;
      }
      return;
    }

    // Write out the previous sample, and synthesize samples in between the
    // two timestamps. Unfortunately the ART trace format does not record
    // timestamps for samples in which the stack does not change. We fill up
    // such gaps with evenly-spaced synthesized samples at the interval that
    // was divined earlier.
    while (this._nextSampleTimestamp < timestampInMSSinceStartTime) {
      (this._samples.data as any).push([
        this._currentStack,
        this._nextSampleTimestamp,
      ]);
      if (this._honorOriginalSamplingTimestamps) {
        // Only use this loop to fill up any gaps that are at least 2 * interval wide.
        // When less than 2 * interval remains, snap to the original next timestamp.
        if (
          timestampInMSSinceStartTime - this._nextSampleTimestamp <
          2 * this._intervalInMsec
        ) {
          this._nextSampleTimestamp = timestampInMSSinceStartTime;
          break;
        }
      }
      this._nextSampleTimestamp += this._intervalInMsec;
    }
  }

  finish(): GeckoThreadVersion11 {
    if (this._nextSampleTimestamp !== null) {
      (this._samples.data as any).push([
        this._currentStack,
        this._nextSampleTimestamp,
      ]);
    }
    return {
      tid: this._tid,
      pid: this._pid,
      name: this._name,
      registerTime: this._registerTime,
      unregisterTime: null,
      markers: this._markers,
      samples: this._samples,
      frameTable: this._frameTable,
      stackTable: this._stackTable,
      stringTable: this._stringTable,
    };
  }
}

export function isArtTraceFormat(traceBuffer: ArrayBuffer) {
  return detectArtTraceFormat(traceBuffer) !== 'unrecognized';
}

// Convert an ART trace to the Gecko profile format.
export function convertArtTraceProfile(
  traceBuffer: ArrayBuffer
): GeckoProfileVersion11 {
  const trace = parseArtTrace(traceBuffer);
  const originalIntervalInUsec = procureSamplingInterval(trace);
  let honorOriginalSamplingTimestamps = false;
  let intervalInMsec;
  if (!originalIntervalInUsec || originalIntervalInUsec < 100) {
    // This is probably a tracing-based profile. Do fake-sampling.
    intervalInMsec = 0.1;
  } else {
    intervalInMsec = Math.round(originalIntervalInUsec / 100) / 10;
    // Honor the sampler's timestamps, even if samples overlap.
    honorOriginalSamplingTimestamps = true;
  }

  const { summaryDetails, threads, methods, methodActions } = trace;
  const categoryInfo = new CategoryInfo(methods);
  const methodMap = new Map(methods.map((m) => [m.methodId, m]));
  const threadBuilderMap = new Map();

  if (methodActions.length > 0) {
    for (let i = 0; i < methodActions.length; i++) {
      const { tid, methodId, globalTime, action } = methodActions[i];
      let threadBuilder = threadBuilderMap.get(tid);
      if (threadBuilder === undefined) {
        const traceThread = threads.find((t) => t.tid === tid);
        if (!traceThread) {
          throw new Error(
            `Encountered method action for unknown thread ${tid}`
          );
        }
        threadBuilder = new ThreadBuilder(
          traceThread.threadName,
          summaryDetails.pid ? +summaryDetails.pid : 1,
          tid,
          methodMap,
          intervalInMsec,
          honorOriginalSamplingTimestamps,
          categoryInfo
        );
        threadBuilderMap.set(tid, threadBuilder);
      }
      threadBuilder.advanceTimeTo(globalTime / 1000);
      switch (action) {
        case 'enter':
          threadBuilder.enterMethod(methodId);
          break;
        case 'exit':
        case 'exit-unroll':
          threadBuilder.exitMethod(methodId);
          break;
        default:
          throw new Error(`Unexpected action ${action}`);
      }
    }
  }

  const threadArray = Array.from(threadBuilderMap.values()).map(
    (threadBuilder) => threadBuilder.finish()
  );

  return {
    meta: {
      interval: intervalInMsec,
      processType: 0,
      product: 'ART Trace (Android)',
      importedFrom: 'ART Trace (Android)',
      pid: summaryDetails.pid,
      stackwalk: 1,
      startTime: 0,
      shutdownTime: null,
      version: 11,
      presymbolicated: true,
      categories: categoryInfo.categories,
    } as any,
    libs: [],
    threads: threadArray,
    processes: [],
    pausedRanges: [],
  };
}
