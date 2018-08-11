/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * The "perf script" format is the plain text format that is output by an
 * invocation of `perf script`, where `perf` is the Linux perf command line tool.
 */
export function isPerfScriptFormat(profile: string): boolean {
  const firstLine = profile.substring(0, profile.indexOf('\n'));
  return /^(\S.+?)\s+(\d+)\/*(\d+)*\s+([\d.]+)/.test(firstLine);
}

/**
 * Convert the output from `perf script` into the gecko profile format.
 */
export function convertPerfScriptProfile(profile: string): Object {
  function _createThread(name, pid, tid) {
    const markers = {
      schema: {
        name: 0,
        time: 1,
        data: 2,
      },
      data: [],
    };
    const samples = {
      schema: {
        stack: 0,
        time: 1,
        responsiveness: 2,
        rss: 3,
        uss: 4,
        frameNumber: 5,
      },
      data: [],
    };
    const frameTable = {
      schema: {
        location: 0,
        implementation: 1,
        optimizations: 2,
        line: 3,
        category: 4,
      },
      data: [],
    };
    const stackTable = {
      schema: {
        frame: 0,
        prefix: 1,
      },
      data: [],
    };
    const stringTable = [];

    const stackMap = new Map();
    function getOrCreateStack(frame, prefix) {
      const key = prefix === null ? `${frame}` : `${frame},${prefix}`;
      let stack = stackMap.get(key);
      if (stack === undefined) {
        stack = stackTable.data.length;
        stackTable.data.push([frame, prefix]);
        stackMap.set(key, stack);
      }
      return stack;
    }

    const frameMap = new Map();
    function getOrCreateFrame(frameString) {
      let frame = frameMap.get(frameString);
      if (frame === undefined) {
        frame = frameTable.data.length;
        const stringIndex = stringTable.length;
        stringTable.push(frameString);
        frameTable.data.push([stringIndex]);
        frameMap.set(frameString, frame);
      }
      return frame;
    }

    function addSample(stackArray, time) {
      const stack = stackArray.reduce((prefix, stackFrame) => {
        const frame = getOrCreateFrame(stackFrame);
        return getOrCreateStack(frame, prefix);
      }, null);
      samples.data.push([stack, time]);
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
        };
      },
    };
  }

  const threadMap = new Map();

  function _addThreadSample(pid, tid, threadName, timeStamp, stack) {
    // Right now this assumes that you can't have two identical tids in
    // different pids, which is true in linux at least.
    let thread = threadMap.get(tid);
    if (thread === undefined) {
      thread = _createThread(threadName, pid, tid);
      threadMap.set(tid, thread);
    }
    thread.addSample(stack, timeStamp);
  }

  // Parse the format. The two regular expressions and some of the comments
  // below were taken from Brendan Gregg's stackcollapse-perf.pl.
  const lines = profile.split('\n');

  let lineIndex = 0;
  let startTime = 0;
  while (lineIndex < lines.length) {
    const sampleStartLine = lines[lineIndex++];
    // default "perf script" output has TID but not PID
    // eg, "java 25607 4794564.109216: cycles:"
    // eg, "java 12688 [002] 6544038.708352: cpu-clock:"
    // eg, "V8 WorkerThread 25607 4794564.109216: cycles:"
    // eg, "java 24636/25607 [000] 4794564.109216: cycles:"
    // eg, "java 12688/12764 6544038.708352: cpu-clock:"
    // eg, "V8 WorkerThread 24636/25607 [000] 94564.109216: cycles:"
    // other combinations possible
    // pattern: thread-name-with-optional-spaces tid time: NNN cycles:XXXX:
    // alternate pattern: thread-name-with-optional-spaces pid/tid time: NNN cycles:XXXX:
    // eg, "java 25607/25608 4794564.109216: 33 cycles:uppp"
    //   (generate with "perf script -F +pid")
    const sampleStartMatch = /^(\S.*?)(?=(?:\s+(?:(?:\d+)\/*(?:\d+)*\s)))\s+(\d+)\/*(\d+)*\s+([\d.]+)/.exec(
      sampleStartLine
    );
    if (sampleStartMatch) {
      const threadName = sampleStartMatch[1];
      const tid = sampleStartMatch[3] || sampleStartMatch[2];
      const pid = sampleStartMatch[3] ? sampleStartMatch[2] : 0;
      const timeStamp = parseFloat(sampleStartMatch[4]) * 1000;
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
        const stackFrameMatch = /^\s*(\w+)\s*(.+) \((\S*)\)/.exec(
          stackFrameLine
        );
        if (stackFrameMatch) {
          // const pc = stackFrameMatch[1];
          let rawFunc = stackFrameMatch[2];
          // const mod = stackFrameMatch[3];

          // Linux 4.8 included symbol offsets in perf script output by default, eg:
          // 7fffb84c9afc cpu_startup_entry+0x800047c022ec ([kernel.kallsyms])
          // strip these off:
          rawFunc = rawFunc.replace(/\+0x[\da-f]+$/, '');

          if (rawFunc.startsWith('(')) {
            continue; // skip process names
          }

          stack.push(rawFunc);
        }
      }

      if (stack.length !== 0) {
        stack.reverse();
        _addThreadSample(pid, tid, threadName, timeStamp, stack);
      }
    }
  }

  const threadArray = Array.from(threadMap.values()).map(thread =>
    thread.finish()
  );

  return {
    meta: {
      abi: 'x86_64-gcc3',
      interval: 1,
      misc: 'rv:48.0',
      oscpu: 'Intel Fedora 28',
      platform: 'Linux Fedora',
      processType: 0,
      product: 'Firefox',
      stackwalk: 1,
      startTime: startTime,
      toolkit: 'gtk',
      version: 4,
    },
    libs: [],
    threads: threadArray,
  };
}
