import { UniqueStringArray } from '../utils/unique-string-array';

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

function _firstNLines(s: string, n: number) {
  let lineEnd = -1;
  for (let i = 0; i < n; i++) {
    lineEnd = s.indexOf('\n', lineEnd + 1);
    if (lineEnd === -1) {
      lineEnd = s.length;
      break;
    }
  }
  return s.substr(0, lineEnd).split('\n');
}

/**
 * The Activity Monitor format is the plain text format that is output by the
 * `sample` tool on macOS and by the "Sample process" action in Activity
 * Monitor.
 */
export function isActivityMonitorFormat(profile: string): boolean {
  // Sampling process 1740 for 3 seconds with 1 millisecond of run time between samples
  // Sampling completed, processing symbols...
  // Analysis of sampling Activity Monitor (pid 1740) every 1 millisecond
  return _firstNLines(profile, 5).some(line =>
    /^Analysis of sampling .+ \(pid [0-9]+\) every [0-9]+ milliseconds?/.test(
      line
    )
  );
}

class LineCursor {
  _lines: string[];
  _currentLineIndex: number;

  constructor(lines: string[]) {
    this._lines = lines;
    this._currentLineIndex = 0;
  }
  hasNextLine(): boolean {
    return this._currentLineIndex < this._lines.length;
  }
  peekNextLine(): string {
    if (!this.hasNextLine()) {
      throw new Error('only call this if you know that there are lines left');
    }
    return this._lines[this._currentLineIndex];
  }
  getNextLine(): string {
    if (!this.hasNextLine()) {
      throw new Error('only call this if you know that there are lines left');
    }
    return this._lines[this._currentLineIndex++];
  }
  consumeLine() {
    this._currentLineIndex++;
  }
}

function _parseDate(dateString: string): Date {
  // 2018-05-28 19:15:41.099 -0400
  const [
    ,
    year,
    month,
    date,
    hours,
    minutes,
    seconds,
    ms,
  ] = /^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]+)(\.?[0-9]+) (-?[0-9]+)$/.exec(
    dateString
  );
  // We discard the timezone offset and interpret the date in local time,
  // because everything else seems really hard to do with vanilla JavaScirpt.
  return new Date(year, month - 1, date, hours, minutes, seconds, ms);
}

type Header = {
  processName: string,
  pid: string,
  interval: number,
  processStartTime: Date,
  profileStartTime: Date,
  systemDescription: string,
};

function _parseHeader(cursor: LineCursor): Header {
  let introLineMatch;
  do {
    if (!cursor.hasNextLine()) {
      throw new Error("couldn't find find introduction line");
    }
    introLineMatch = /^Analysis of sampling (.+) \(pid ([0-9]+)\) every ([0-9]+) milliseconds?/.exec(
      cursor.getNextLine()
    );
  } while (!introLineMatch);
  const [, processName, pid, interval] = introLineMatch;

  // Process:         plugin-container [8899]
  // Path:            /Applications/Firefox Nightly.app/Contents/MacOS/plugin-container.app/Contents/MacOS/plugin-container
  // Load Address:    0x10c5e0000
  // Identifier:      org.mozilla.plugincontainer
  // Version:         1.0
  // Code Type:       X86-64
  // Parent Process:  firefox [6296]
  //
  // Date/Time:       2018-05-28 19:15:41.099 -0400
  // Launch Time:     2018-05-28 19:14:16.920 -0400
  // OS Version:      Mac OS X 10.12.6 (16G1314)
  // Report Version:  7
  // Analysis Tool:   /usr/bin/sample
  const properties: { [string]: string } = {};
  while (true) {
    if (!cursor.hasNextLine()) {
      throw new Error("couldn't find end of header");
    }
    const line = cursor.getNextLine();
    if (line === '----') {
      break;
    }
    const match = /^(.*): +(.*)$/.exec(line);
    if (match) {
      const [, propertyName, propertyValue] = match;
      properties[propertyName] = propertyValue;
    }
  }

  return {
    processName,
    pid,
    interval: +interval,
    processStartTime: _parseDate(properties['Launch Time']),
    profileStartTime: _parseDate(properties['Date/Time']),
    codeType: properties['Code Type'],
    systemDescription: properties['OS Version'],
  };
}

type StackFrame = {
  functionName: string,
  libName: string,
  libLoadAddress?: number,
  offsetAbsolute: number,
  offsetRelativeToLib?: number,
  offsetRelativeToFunction?: number,
};

type StackNode = {
  +totalSampleCount: number,
  +frame: StackFrame,
  +children: StackNode[],
};

type ThreadCallGraph = {
  +tid: number | void,
  +name: string,
  +dispatchQueueInfo: string | void,
  +totalSampleCount: number,
  +rootStackNodes: StackNode[],
};

type CallGraph = Array<ThreadCallGraph>;

function _parseFrame(frameStr: string): StackFrame {
  // XRE_InitChildProcess(int, char**, XREChildData const*)  (in XUL) + 2003  [0x118057d73]
  // moz_xmalloc  (in libmozglue.dylib) + 14  [0x10c9311fe]
  // rgba64_mark  (in CoreGraphics) + 7265,7328,...  [0x7fffc55dc89b,0x7fffc55dc8da,...]
  // ???  (in Activity Monitor)  load address 0x1011b6000 + 0x27b6c  [0x1011ddb6c]
  // ???  (in <unknown binary>)  [0x34a8da74e4e2]
  const match = /^(.*) \(in (.*)\)(.*)$/.exec(frameStr);
  if (!match) {
    if (frameStr === '0x0') {
      return {
        functionName: '0x0',
        libName: '<unknown binary>',
        offsetAbsolute: 0,
      };
    }
    console.error(`unparseable frameStr: ${frameStr}`);
    return {
      functionName: frameStr,
      libName: '<unknown binary>',
      offsetAbsolute: 0,
    };
  }
  const [, functionName, libName, rest] = match;
  const absoluteAddressMatch = /^(.*) {2}\[0x([0-9a-f]+)(,0x([0-9a-f]+))?(,\.\.\.)?\]$/.exec(
    rest
  );
  if (!absoluteAddressMatch) {
    console.log('rest:', rest);
    return {
      functionName: frameStr,
      libName: '<unknown binary>',
      offsetAbsolute: 0,
    };
  }
  const [, inBetween, absoluteAddress] = absoluteAddressMatch;
  const frame: StackFrame = {
    functionName: functionName.trim(),
    libName,
    offsetAbsolute: parseInt(absoluteAddress, 16),
  };
  const relativeToFunctionMatch = /^ +\+ ([0-9]+)(,([0-9]+))?(,\.\.\.)?$/.exec(
    inBetween
  );
  if (relativeToFunctionMatch) {
    const [, offsetRelativeToFunctionStr] = relativeToFunctionMatch;
    frame.offsetRelativeToFunction = +offsetRelativeToFunctionStr;
  } else {
    const loadAddressMatch = /^ {2}load address 0x([0-9a-f]+) \+ 0x([0-9a-f]+)$/.exec(
      inBetween
    );
    if (loadAddressMatch) {
      const [, , offsetRelativeToLibStr] = loadAddressMatch;
      frame.offsetRelativeToLib = parseInt(offsetRelativeToLibStr, 16);
    } else {
      console.log(`can't parse inBetween: "${inBetween}"`);
    }
  }
  return frame;
}

function _parseThreadCallGraph(cursor: LineCursor): ThreadCallGraph {
  // "    2336 Thread_18068434"
  // "    2336 Thread_18068449: JS Helper"
  // "    2336 Thread_18068437: Chrome_~dThread"
  // "    2336 Thread_18068423   DispatchQueue_1: com.apple.main-thread  (serial)"
  // "    110 Thread_<multiple>   DispatchQueue_86: sample process queue  (serial)"
  const firstLine = cursor.getNextLine();
  const match = /^( *)([0-9]+) Thread_(.*)$/.exec(firstLine);
  if (!match) {
    console.error("first line of thread didn't match: ", firstLine);
    throw new Error('Failed parsing activity monitor sample');
  }
  const [, rootIndentStr, totalSampleCountStr, rest] = match;
  const rootIndent = rootIndentStr.length;
  const totalSampleCount = +totalSampleCountStr;
  let threadName = `Thread_${rest}`;
  let tid = undefined;
  let dispatchQueueInfo = undefined;
  const tidMatch = /^([0-9]+)$/.exec(rest);
  if (tidMatch) {
    tid = +tidMatch[1];
    threadName = `Thread_${tid}`;
  } else {
    const threadNameMatch = /^([0-9]+): (.*)$/.exec(rest);
    if (threadNameMatch) {
      tid = +threadNameMatch[1];
      threadName = threadNameMatch[2];
    } else {
      const tidDispatchQueueMatch = /^([0-9]+) {3}(DispatchQueue_.*)$/.exec(
        rest
      );
      if (tidDispatchQueueMatch) {
        tid = +tidDispatchQueueMatch[1];
        dispatchQueueInfo = tidDispatchQueueMatch[2];
      } else {
        const multipleTIDsDispatchQueueMatch = /^<multiple> {3}(DispatchQueue_.*)$/.exec(
          rest
        );
        if (multipleTIDsDispatchQueueMatch) {
          dispatchQueueInfo = multipleTIDsDispatchQueueMatch[1];
        } else {
          console.log('unknown rest:', rest);
        }
      }
    }
  }

  const parentOfRoots = {
    totalSampleCount,
    frame: { functionName: '(parentOfRoots)', libName: '' },
    children: [],
  };
  let currentStack: StackNode[] = [parentOfRoots];

  while (
    cursor.hasNextLine() &&
    cursor.peekNextLine().startsWith(rootIndentStr)
  ) {
    const [
      ,
      indentStr,
      sampleCountStr,
      frameStr,
    ] = /^([ +!:|]+)([0-9]+) (.*)$/.exec(cursor.peekNextLine());
    const depth = (indentStr.length - rootIndent) / 2;
    if (depth === 0) {
      // This line belongs to the next thread.
      break;
    }
    cursor.consumeLine();
    const parentNode = currentStack[depth - 1];
    const node = {
      totalSampleCount: +sampleCountStr,
      frame: _parseFrame(frameStr),
      children: [],
    };
    parentNode.children.push(node);
    currentStack = [...currentStack.slice(0, depth), node];
  }

  return {
    tid,
    name: threadName,
    dispatchQueueInfo,
    totalSampleCount,
    rootStackNodes: parentOfRoots.children,
  };
}

function _parseCallGraph(cursor: LineCursor): CallGraph {
  do {
    if (!cursor.hasNextLine()) {
      throw new Error("couldn't find call graph introduction line");
    }
  } while (cursor.getNextLine() !== 'Call graph:');

  const threads = [];
  while (cursor.hasNextLine() && cursor.peekNextLine() !== '') {
    threads.push(_parseThreadCallGraph(cursor));
  }

  return threads;
}

type BinaryImage = {
  start: number,
  end: number,
  name: string,
  version: string,
  versionDescription: string,
  uuid: string,
  path: string,
};

function _parseBinaryImages(cursor: LineCursor): BinaryImage[] {
  do {
    if (!cursor.hasNextLine()) {
      throw new Error("couldn't find binary images introduction line");
    }
  } while (cursor.getNextLine() !== 'Binary Images:');

  const binaryImages = [];

  while (cursor.hasNextLine()) {
    const line = cursor.peekNextLine();
    //        0x1011b6000 -        0x101213ff7  com.apple.ActivityMonitor (10.12 - 968) <75657928-72A4-38FA-B9EE-D6B92A82777E> /Applications/Utilities/Activity Monitor.app/Contents/MacOS/Activity Monitor
    //     0x7fffbffa1000 -     0x7fffc00d4ffb  com.apple.AMDMTLBronzeDriver (1.51.8 - 1.5.1) <FC04A989-F462-3E16-B2A1-64635283AE61> /System/Library/Extensions/AMDMTLBronzeDriver.bundle/Contents/MacOS/AMDMTLBronzeDriver
    //     0x7fffc1b06000 -     0x7fffc1b06fff  com.apple.Accelerate (1.11 - Accelerate 1.11) <916E360F-323C-3AE1-AB3D-D1F3B284AEE9> /System/Library/Frameworks/Accelerate.framework/Versions/A/Accelerate
    //        0x11484b000 -        0x114888dc7  dyld (0.0 - ???) <322C06B7-8878-311D-888C-C8FD2CA96FF3> /usr/lib/dyld
    //        0x10c5e0000 -        0x10c5e0ff7 +org.mozilla.plugincontainer (1.0) <FC1BED43-61D6-3C98-8209-F73F55BF456B> /Applications/Firefox Nightly.app/Contents/MacOS/plugin-container.app/Contents/MacOS/plugin-container
    //        0x1148d6000 -        0x119ed0fa7 +XUL (1) <3EE896DB-7143-3EC0-99D4-94A1EC64BEC7> /Applications/Firefox Nightly.app/Contents/MacOS/XUL
    const match = /^\s*0x([0-9a-f]+) - \s*0x([0-9a-f]+)\s+(\+)?(.*) \((\S*)( - (.*))?\) <([0-9A-F-]+)> (.*)$/.exec(
      line
    );
    if (!match) {
      break;
    }
    cursor.consumeLine();
    const [
      ,
      startAddressStr,
      endAddressStr,
      ,
      name,
      version,
      ,
      optionalVersionDescription,
      uuid,
      path,
    ] = match;
    binaryImages.push({
      start: parseInt(startAddressStr, 16),
      end: parseInt(endAddressStr, 16),
      name,
      version,
      versionDescription: optionalVersionDescription,
      uuid,
      path,
    });
  }

  return binaryImages;
}

function _convertThread(
  threadCallGraph: ThreadCallGraph,
  pid: string,
  libs,
  interval: number
): Object {
  const stringTable = new UniqueStringArray();

  const resourceTable = {
    length: libs.length,
    type: libs.map(() => 1),
    name: libs.map(l => stringTable.indexForString(l.name)),
    lib: libs.map((_l, i) => i),
    host: libs.map(() => null),
  };

  const libIndexByName = new Map(libs.map((l, i) => [l.name, i]));

  const funcTable = {
    length: 0,
    name: [],
    resource: [],
    address: [],
    isJS: [],
    fileName: [],
    lineNumber: [],
  };

  const frameTable = {
    length: 0,
    address: [],
    category: [],
    func: [],
    implementation: [],
    line: [],
    optimizations: [],
  };

  const samples = {
    length: 0,
    stack: [],
    time: [],
    rss: [],
    uss: [],
    responsiveness: [],
  };

  const stackTable = {
    length: 0,
    prefix: [],
    frame: [],
  };

  const markers = {
    length: 0,
    data: [],
    time: [],
    name: [],
  };

  const frameByAddress = new Map();
  const funcByAddress = new Map();

  function convertFunc(frame: StackFrame): number {
    let funcAddress = frame.offsetAbsolute;
    if (frame.offsetRelativeToFunction) {
      funcAddress -= frame.offsetRelativeToFunction;
    }
    let funcIndex = funcByAddress.get(funcAddress);
    if (funcIndex === undefined) {
      let libIndex = libIndexByName.get(frame.libName);
      let address = funcAddress;
      if (libIndex !== undefined) {
        address -= libs[libIndex].start;
      } else {
        libIndex = null;
      }

      let funcName = frame.functionName;
      if (funcName === '???') {
        funcName = `0x${funcAddress.toString(16)}`;
      }

      funcIndex = funcTable.length++;
      funcTable.name.push(stringTable.indexForString(funcName));
      funcTable.resource.push(libIndex);
      funcTable.address.push(address);
      funcTable.isJS.push(null);
      funcTable.fileName.push(null);
      funcTable.lineNumber.push(null);
      funcByAddress.set(funcAddress, funcIndex);
    }
    return funcIndex;
  }

  function convertFrame(frame: StackFrame): number {
    const frameAddress = frame.offsetAbsolute;
    let frameIndex = frameByAddress.get(frameAddress);
    if (frameIndex === undefined) {
      let libIndex = libIndexByName.get(frame.libName);
      let address = frameAddress;
      if (libIndex !== undefined) {
        address -= libs[libIndex].start;
      } else {
        libIndex = null;
      }

      frameIndex = frameTable.length++;
      frameTable.address.push(address);
      frameTable.category.push(null);
      frameTable.func.push(convertFunc(frame));
      frameTable.implementation.push(null);
      frameTable.line.push(null);
      frameTable.optimizations.push(null);
      frameByAddress.set(frameAddress, frameIndex);
    }
    return frameIndex;
  }

  function addSamplesWithStack(stack: number, count: number) {
    for (let i = 0; i < count; i++) {
      const index = samples.length++;
      samples.stack.push(stack);
      samples.time.push(index * interval);
      samples.rss.push(null);
      samples.uss.push(null);
      samples.responsiveness.push(null);
    }
  }

  function convertStackNode(node: StackNode, prefix: number) {
    const frame = convertFrame(node.frame);
    const stackIndex = stackTable.length++;
    stackTable.prefix.push(prefix);
    stackTable.frame.push(frame);
    let childrenSampleCount = 0;
    for (const childNode of node.children) {
      convertStackNode(childNode, stackIndex);
      childrenSampleCount += childNode.totalSampleCount;
    }
    addSamplesWithStack(
      stackIndex,
      node.totalSampleCount - childrenSampleCount
    );
  }

  for (const rootNode of threadCallGraph.rootStackNodes) {
    convertStackNode(rootNode, null);
  }

  return {
    name: threadCallGraph.name,
    processType: 'default',
    processStartupTime: 0,
    processShutdownTime: null,
    registerTime: 0,
    unregisterTime: null,
    tid: threadCallGraph.tid,
    libs,
    pid,
    resourceTable,
    pausedRanges: [],
    markers,
    samples,
    stackTable,
    funcTable,
    frameTable,
    stringArray: stringTable.serializeToArray(),
  };
}

/**
 * Convert the Activity Monitor profile into the gecko profile format.
 */
export function convertActivityMonitorProfile(profile: string): Object {
  const cursor = new LineCursor(profile.split('\n'));
  const header = _parseHeader(cursor);
  const callGraph = _parseCallGraph(cursor);
  const binaryImages = _parseBinaryImages(cursor);

  const libs = binaryImages.map(({ start, end, name, path, uuid }) => ({
    start,
    end,
    name,
    path,
    debugName: name,
    debugPath: path,
    breakpadId: uuid.replace(/-/g, '') + '0',
    offset: 0,
    arch: null,
  }));

  return {
    meta: {
      version: 11,
      preprocessedProfileVersion: 12,
      interval: header.interval,
      abi: header.codeType,
      startTime: header.processStartTime.valueOf(),
      extensions: [],
      categories: [
        {
          color: 'grey',
          name: 'Other',
        },
      ],
      platform: 'Macintosh',
      oscpu: header.systemDescription,
      product: header.processName,
    },
    threads: callGraph.map(threadCallGraph =>
      _convertThread(threadCallGraph, header.pid, libs, header.interval)
    ),
  };
}
