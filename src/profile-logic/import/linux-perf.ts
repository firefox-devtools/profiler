/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { MixedObject } from 'firefox-profiler/types';

/**
 * The "perf script" format is the plain text format that is output by an
 * invocation of `perf script`, where `perf` is the Linux perf command line tool.
 */
export function isPerfScriptFormat(profile: string): boolean {
  // We can have two different types of perf script files:
  // Files with header and files without header.
  //
  // The header, if present, looks like this (generated here [1]):
  //
  // # ========
  // # captured on    : Mon Aug 30 11:15:28 2021
  // # header version : 1
  // # data offset    : 336
  // # data size      : 31672
  // # feat offset    : 32008
  // # hostname : somehost
  // # os release : 5.10.40-amd64
  // # ========
  // #
  //
  // Then the first sample begins. Each sample starts with a line containing the
  // thread name, tid/pid, and timestamp.
  // eg, "V8 WorkerThread 24636/25607 [000] 94564.109216: cycles:"
  //
  // If there's no header, the file starts with the first sample immediately.
  //
  // To detect these files, we detect the header if present, or the first line
  // of the first sample if no header is present.
  //
  // [1] https://github.com/torvalds/linux/blob/20cf903a0c407cef19300e5c85a03c82593bde36/tools/perf/util/session.c#L2755-L2757

  if (profile.startsWith('# ========\n')) {
    return true;
  }

  if (profile.startsWith('{')) {
    // Make sure we don't accidentally match JSON
    return false;
  }

  // There was no header, so we need to match the first line of the first sample.
  const firstLine = profile.substring(0, profile.indexOf('\n'));

  //          +- process name (anything before the rest of the regexp, can contain spaces)
  //          |        +- PID/ (optional)
  //          |        |      +- TID
  //          |        |      |          +- [CPU] (optional, present in SimplePerf output)
  //          |        |      |          |          +- timestamp
  //       vvvvv   vvvvvvvvv vvv   vvvvvvvvvvvvvv vvvvvv
  return /^\S.*?\s+(?:\d+\/)?\d+\s+(?:\[\d+\]\s+)?[\d.]+:/.test(firstLine);
}

// Don't try and type this more specifically.
type GeckoProfileVersion24 = MixedObject;

const CATEGORIES = [
  { name: 'User', color: 'yellow', subcategories: ['Other'] },
  { name: 'Kernel', color: 'orange', subcategories: ['Other'] },
];
const USER_CATEGORY_INDEX = 0;
const KERNEL_CATEGORY_INDEX = 1;

/**
 * Convert the output from `perf script` into the gecko profile format (version 24).
 */
export function convertPerfScriptProfile(
  profile: string
): GeckoProfileVersion24 {
  function _createThread(name: string, pid: number, tid: number) {
    const markers = {
      schema: {
        name: 0,
        startTime: 1,
        endTime: 2,
        phase: 3,
        category: 4,
        data: 5,
      },
      data: [],
    };
    const samples = {
      schema: {
        stack: 0,
        time: 1,
        responsiveness: 2,
      },
      data: [] as Array<[number | null, number, number]>,
    };
    const frameTable = {
      schema: {
        location: 0,
        relevantForJS: 1,
        innerWindowID: 2,
        implementation: 3,
        optimizations: 4,
        line: 5,
        column: 6,
        category: 7,
        subcategory: 8,
      },
      data: [] as Array<
        [number, boolean, number, null, null, null, null, number, null]
      >,
    };
    const stackTable = {
      schema: {
        prefix: 0,
        frame: 1,
      },
      data: [] as Array<[number | null, number]>,
    };
    const stringTable: string[] = [];

    const stackMap = new Map();
    function getOrCreateStack(frame: number, prefix: number | null) {
      const key = prefix === null ? `${frame}` : `${frame},${prefix}`;
      let stack = stackMap.get(key);
      if (stack === undefined) {
        stack = stackTable.data.length;
        stackTable.data.push([prefix, frame]);
        stackMap.set(key, stack);
      }
      return stack;
    }

    const frameMap = new Map();
    function getOrCreateFrame(frameString: string): number {
      let frame = frameMap.get(frameString);
      if (frame === undefined) {
        frame = frameTable.data.length;
        const location = stringTable.length;
        stringTable.push(frameString);
        // Heuristic: Treat frames which match any of the following conditions
        // as Linux kernel frames:
        // - contains kallsyms
        // - contains in '/vmlinux' (seen when full kernel debug symbols are present,
        //   e.g. /usr/lib/debug/lib/modules/5.10.102-99.473.amzn2.aarch64/vmlinux)
        // - ends in '.ko' (kernel module, e.g.
        //   /lib/modules/5.10.102-99.473.amzn2.aarch64/kernel/drivers/amazon/net/ena/ena.ko
        // Using such heuristics is and easier/more portable
        // than checking if the address is in kernel-space (e.g. starting with FF).
        const category =
          frameString.includes('kallsyms') ||
          frameString.includes('/vmlinux)') ||
          frameString.endsWith('.ko)')
            ? KERNEL_CATEGORY_INDEX
            : USER_CATEGORY_INDEX;
        const implementation = null;
        const optimizations = null;
        const line = null;
        const relevantForJS = false;
        const subcategory = null;
        const innerWindowID = 0;
        const column = null;
        frameTable.data.push([
          location,
          relevantForJS,
          innerWindowID,
          implementation,
          optimizations,
          line,
          column,
          category,
          subcategory,
        ]);
        frameMap.set(frameString, frame);
      }
      return frame;
    }

    function addSample(threadName: string, stackArray: string[], time: number) {
      // often we create a thread which inherits the name of the parent, and
      // set the thread's name slightly later.  Avoid having the first
      // sample's name stick.
      if (name !== threadName) {
        name = threadName;
      }
      const stack = stackArray.reduce<number | null>((prefix, stackFrame) => {
        const frame = getOrCreateFrame(stackFrame);
        return getOrCreateStack(frame, prefix);
      }, null);
      // We don't have this information, so simulate that there's no latency at
      // all in processing events.
      const responsiveness = 0;
      samples.data.push([stack, time, responsiveness]);
    }

    return {
      addSample,
      finish: () => {
        return {
          tid,
          pid,
          name,
          markers,
          samples,
          frameTable,
          stackTable,
          stringTable,
          registerTime: 0,
          unregisterTime: null,
          processType: 'default',
        };
      },
    };
  }

  const threadMap = new Map<number, any>();

  function _addThreadSample(
    pid: number,
    tid: number,
    threadName: string,
    timeStamp: number,
    stack: string[]
  ) {
    // Right now this assumes that you can't have two identical tids in
    // different pids, which is true in linux at least.
    let thread = threadMap.get(tid);
    if (thread === undefined) {
      thread = _createThread(threadName, pid, tid);
      threadMap.set(tid, thread);
    }
    thread.addSample(threadName, stack, timeStamp);
  }

  // Parse the format. Some of the regular expressions and comments below were
  // taken from Brendan Gregg's stackcollapse-perf.pl.
  const lines = profile.split('\n');

  let lineIndex = 0;
  let startTime = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex++];
    // perf script --header outputs header lines beginning with #
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const sampleStartLine = line;
    // default "perf script" output has TID but not PID
    // eg, "java 25607 4794564.109216: cycles:"
    // eg, "java 12688 [002] 6544038.708352: cpu-clock:"
    // eg, "V8 WorkerThread 25607 4794564.109216: cycles:"
    // eg, "java 24636/25607 [000] 4794564.109216: cycles:"
    // eg, "Gecko	25122 [007] 115539.936601:		1000000 task-clock:u:" <-- SimplePerf output; note the tab characters
    // eg, "java 12688/12764 6544038.708352: cpu-clock:"
    // eg, "V8 WorkerThread 24636/25607 [000] 94564.109216: cycles:"
    // other combinations possible
    // pattern: thread-name-with-optional-spaces-and-numbers tid [NNN] time: NNN cycles:XXXX:
    // alternate pattern: thread-name-with-optional-spaces-and-numbers pid/tid [NNN] time: NNN cycles:XXXX:
    // eg, "FS Broker 5858  5791/5860  30171.917889:    4612247 cycles:ppp: "
    // eg, "java 25607/25608 4794564.109216: 33 cycles:uppp"
    //   (generate with "perf script -F +pid")

    // First, get the sample's time stamp and whatever comes before the timestamp:
    const sampleStartMatch = /^(.*)\s+([\d.]+):/.exec(sampleStartLine);
    if (!sampleStartMatch) {
      console.log(
        'Could not parse line as the start of a sample in the "perf script" profile format: "%s"',
        sampleStartLine
      );
      continue;
    }

    const beforeTimeStamp = sampleStartMatch[1];
    const timeStamp = parseFloat(sampleStartMatch[2]) * 1000;

    // Now try to find the tid within `beforeTimeStamp`, possibly with a pid/ in
    // front of it. Treat everything before that as the thread name.
    //                                  +- threadName
    //                                  |          +- pid/ (optional)
    //                                  |          |        +- tid
    //                                  |          |        |   +- end of word (space or end of string)
    //                                 vvvv   vvvvvvvvvvv vvvvv v
    const threadNamePidAndTidMatch = /^(.*)\s+(?:(\d+)\/)?(\d+)\b/.exec(
      beforeTimeStamp
    );

    if (!threadNamePidAndTidMatch) {
      console.log(
        'Could not parse line as the start of a sample in the "perf script" profile format: "%s"',
        sampleStartLine
      );
      continue;
    }

    const threadName = threadNamePidAndTidMatch[1].trim();
    const pid = Number(threadNamePidAndTidMatch[2] || 0);
    const tid = Number(threadNamePidAndTidMatch[3] || 0);

    // Assume start time is the time of the first sample
    if (startTime === 0) {
      startTime = timeStamp;
    }
    // Parse the stack frames of the current sample in a nested loop.
    const stack = [];
    while (lineIndex < lines.length) {
      const stackFrameLine = lines[lineIndex++];
      if (stackFrameLine.trim() === '') {
        // Sample ends.
        break;
      }

      // 	         23fe921 _ZN7mozilla3ipc14MessageChannel11MessageTask3RunEv (/home/mstange/Desktop/firefox/libxul.so)
      const stackFrameMatch = /^\s*(\w+)\s*(.+) \(([^)]*)\)/.exec(
        stackFrameLine
      );
      if (stackFrameMatch) {
        // const pc = stackFrameMatch[1];
        let rawFunc = stackFrameMatch[2];
        const mod = stackFrameMatch[3];

        // Linux 4.8 included symbol offsets in perf script output by default, eg:
        // 7fffb84c9afc cpu_startup_entry+0x800047c022ec ([kernel.kallsyms])
        // strip these off:
        rawFunc = rawFunc.replace(/\+0x[\da-f]+$/, '');

        if (rawFunc.startsWith('(')) {
          continue; // skip process names
        }

        if (mod) {
          // If we have a module name, provide it.
          // The code processing the profile will search for
          // "functionName (in libraryName)" using a regexp,
          // and automatically create the library information.
          rawFunc += ` (in ${mod})`;
        }

        stack.push(rawFunc);
      }
    }

    if (stack.length !== 0) {
      stack.reverse();
      _addThreadSample(pid, tid, threadName, timeStamp, stack);
    }
  }

  const threadArray = Array.from(threadMap.values()).map((thread) =>
    thread.finish()
  );

  for (const thread of threadArray) {
    // The samples are not guaranteed to be in order, sort them so that they are.
    const key = thread.samples.schema.time;
    thread.samples.data.sort((a: any, b: any) => a[key] - b[key]);
  }

  return {
    meta: {
      interval: 1,
      processType: 0,
      product: 'Firefox',
      stackwalk: 1,
      debug: 0,
      gcpoison: 0,
      asyncstack: 1,
      startTime: startTime,
      shutdownTime: null,
      version: 24,
      presymbolicated: true,
      categories: CATEGORIES,
      markerSchema: [],
    },
    libs: [],
    threads: threadArray,
    processes: [],
    pausedRanges: [],
  };
}
