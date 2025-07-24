/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import type {
  Profile,
  RawThread,
  RawStackTable,
  IndexIntoFuncTable,
  IndexIntoStackTable,
  IndexIntoResourceTable,
  MixedObject,
} from 'firefox-profiler/types';

import {
  getEmptyProfile,
  getEmptyThread,
} from '../../profile-logic/data-structures';
import { StringTable } from '../../utils/string-table';
import { ensureExists, coerce } from '../../utils/flow';
import {
  INSTANT,
  INTERVAL,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';

import {
  getOrCreateURIResource,
  getTimeRangeForThread,
} from '../../profile-logic/profile-data';

// Chrome Tracing Event Spec:
// https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
// See also the source code at:
// https://source.chromium.org/chromium/chromium/src/+/main:base/trace_event/trace_event.h;l=1

export type TracingEventUnion =
  | ProfileEvent
  | ProfileChunkEvent
  | CpuProfileEvent
  | ThreadNameEvent
  | ProcessNameEvent
  | ProcessLabelsEvent
  | ProcessSortIndexEvent
  | ThreadSortIndexEvent
  | ScreenshotEvent
  | FallbackEndEvent
  | TracingStartedInBrowserEvent;

type TracingEvent<Event> = {|
  cat: string,
  // List out all known phase values, but then also allow strings. This will get
  // overwritten by the `...Event` line, which will put in the exact phase.
  ph: string, // Phase
  pid: number, // Process ID
  tid: number, // Thread ID
  ts: number, // Timestamp
  tts?: number, // Thread Timestamp
  tdur?: number, // Time duration
  dur?: number, // Time duration
  ...Event,
|};

// V8 can generate this backward compatible event.
// See https://github.com/firefox-devtools/profiler/issues/4308#issuecomment-1303551614
type FallbackEndEvent = TracingEvent<{|
  name: 'ProfileChunk',
  id: string,
  args: {|
    data: {|
      endTime: number,
    |},
  |},
|}>;

type ProfileEvent = TracingEvent<{|
  name: 'Profile',
  args: {
    data: {
      startTime: number,
    },
  },
  ph: 'P',
  id: string,
|}>;

type ProfileChunkEvent = TracingEvent<{|
  name: 'ProfileChunk',
  args: {
    data: {
      cpuProfile: {
        nodes?: Array<{
          callFrame: {
            functionName: string,
            scriptId: number,
            lineNumber?: number,
            columnNumber?: number,
            url?: string,
          },
          id: number,
          parent?: number,
        }>,
        samples: number[], // Index into cpuProfile nodes
      },
      timeDeltas: number[],
    },
  },
  ph: 'P',
  id: string,
|}>;

// The CpuProfileEvent format is similar to the ProfileChunkEvent format.
// Presumably, one of them is the newer format the other is the older format.
// The differences are:
//  - The timeDeltas field is in a different place in the structure
//  - The parent <-> child relationship between nodes is indicated in the
//    opposite direction: ProfileChunkEvent has a "parent" field on each nodes,
//    CpuProfileEvent has a "children" field on each node.
export type CpuProfileEvent = TracingEvent<{|
  name: 'CpuProfile',
  args: {
    data: {
      cpuProfile: CpuProfileData,
    },
  },
  ph: 'I',
|}>;

// A node performance profile only outputs this.
// See https://chromedevtools.github.io/devtools-protocol/tot/Profiler/#type-Profile
type CpuProfileData = {
  nodes?: Array<{
    callFrame: {
      functionName: string,
      scriptId: number,
      lineNumber?: number,
      columnNumber?: number,
      url?: string,
    },
    id: number,
    children?: number[],
  }>,
  samples: number[], // Index into cpuProfile nodes
  timeDeltas: number[],
  startTime: number, // microseconds
  endTime: number, // microseconds
};

type ThreadNameEvent = TracingEvent<{|
  name: 'thread_name',
  ph: 'm' | 'M',
  args: { name: string },
|}>;

type ProcessNameEvent = TracingEvent<{|
  name: 'process_name',
  ph: 'm' | 'M',
  args: { name: string },
|}>;

type ProcessLabelsEvent = TracingEvent<{|
  name: 'process_labels',
  ph: 'm' | 'M',
  args: { labels: string },
|}>;

type ProcessSortIndexEvent = TracingEvent<{|
  name: 'process_sort_index',
  ph: 'm' | 'M',
  args: { sort_index: number },
|}>;

type ThreadSortIndexEvent = TracingEvent<{|
  name: 'thread_sort_index',
  ph: 'm' | 'M',
  args: { sort_index: number },
|}>;

type ScreenshotEvent = TracingEvent<{|
  name: 'Screenshot',
  ph: 'O',
  args: { snapshot: string },
|}>;

type TracingStartedInBrowserEvent = TracingEvent<{|
  name: 'TracingStartedInBrowser',
  ph: 'I',
|}>;

function wrapCpuProfileInEvent(cpuProfile: CpuProfileData): CpuProfileEvent {
  return {
    name: 'CpuProfile',
    args: {
      data: { cpuProfile },
    },
    // This data shouldn't really matter:
    cat: 'other',
    pid: 0,
    tid: 0,
    ts: 0,
    ph: 'I',
  };
}

export function attemptToConvertChromeProfile(
  json: mixed,
  profileUrl?: string
): Promise<Profile> | null {
  if (!json) {
    return null;
  }

  let events: TracingEventUnion[] | void;

  if (Array.isArray(json)) {
    // Chrome profiles come as a list of events.
    const firstEvents = json.slice(0, 5);
    // Lightly check that the first items look like a TracingEvent.
    if (
      firstEvents.every(
        (event) => event && typeof event === 'object' && 'ph' in event
      )
    ) {
      events = coerce<mixed[], TracingEventUnion[]>(json);
    }
  } else if (
    // A node.js profile is a single CpuProfileData, as opposed to a list of events.
    typeof json === 'object' &&
    'samples' in json &&
    'timeDeltas' in json &&
    'startTime' in json &&
    'endTime' in json
  ) {
    events = [];
    events.push(
      wrapCpuProfileInEvent(coerce<MixedObject, CpuProfileData>(json))
    );
  } else if (
    typeof json === 'object' &&
    'traceEvents' in json &&
    Array.isArray(json.traceEvents)
  ) {
    // This is Google Tracing Event format, for example from chrome://tracing.
    events = coerce<mixed, TracingEventUnion[]>(json.traceEvents);
  }

  if (!events) {
    return null;
  }

  const eventsByName: Map<string, TracingEventUnion[]> = new Map();

  for (const tracingEvent of events) {
    if (
      typeof tracingEvent !== 'object' ||
      tracingEvent === null ||
      typeof tracingEvent.name !== 'string'
    ) {
      throw new Error(
        'A tracing event in the chrome profile did not follow the expected form.'
      );
    }
    const { name } = tracingEvent;
    let list = eventsByName.get(name);
    if (!list) {
      list = [];
      eventsByName.set(name, list);
    }
    list.push((tracingEvent: any));
  }

  return processTracingEvents(eventsByName, profileUrl);
}

type ThreadInfo = {
  thread: RawThread,
  funcKeyToFuncId: Map<string, IndexIntoFuncTable>,
  nodeIdToStackId: Map<number | void, IndexIntoStackTable | null>,
  originToResourceIndex: Map<string, IndexIntoResourceTable>,
  lastSeenTime: number,
  lastSampledTime: number,
  pid: number,
  processSortIndex: number,
  threadSortIndex: number,
  tieBreakerIndex: number,
};

function findEvent<T: TracingEventUnion>(
  eventsByName: Map<string, TracingEventUnion[]>,
  name: string,
  f: (T) => boolean
): T | void {
  const events: T[] | void = (eventsByName.get(name): any);
  return events ? events.find(f) : undefined;
}

function findEvents<
  // False positive, generic type bounds:
  // eslint-disable-next-line flowtype/no-weak-types
  T: Object,
>(
  eventsByName: Map<string, TracingEventUnion[]>,
  name: string,
  f: (T) => boolean
): T[] {
  const events: T[] | void = (eventsByName.get(name): any);
  if (!events) {
    return [];
  }
  return events.filter(f);
}

function getThreadInfo(
  threadInfoByPidAndTid: Map<string, ThreadInfo>,
  threadInfoByThread: Map<RawThread, ThreadInfo>,
  eventsByName: Map<string, TracingEventUnion[]>,
  profile: Profile,
  chunk: TracingEventUnion
): ThreadInfo {
  // Identify threads by both pid and tid. Just the tid is not sufficient; for
  // example, I've run across profiles that had the tid 775 for the main threads
  // of both a renderer process and the compositor process.
  const pidAndTid = `${chunk.pid}:${chunk.tid}`;

  const cachedThreadInfo = threadInfoByPidAndTid.get(pidAndTid);
  if (cachedThreadInfo) {
    return cachedThreadInfo;
  }
  const thread = getEmptyThread();
  thread.pid = `${chunk.pid}`;
  // It looks like the TID information in Chrome's data isn't the system's TID
  // but some internal values only unique for a pid. Therefore let's generate a
  // proper unique value.
  thread.tid = pidAndTid;

  // Set the process type to something non-"Gecko". If this is left at
  // "default", threads + processes without samples will not be auto-hidden in
  // the UI.
  thread.processType = 'unknown';

  // Attempt to find a name for this thread:
  thread.name = 'Chrome Thread';
  const threadNameEvent = findEvent<ThreadNameEvent>(
    eventsByName,
    'thread_name',
    (e) => e.pid === chunk.pid && e.tid === chunk.tid
  );
  if (threadNameEvent) {
    thread.name = threadNameEvent.args.name;
    thread.isMainThread =
      thread.name.startsWith('Cr') && thread.name.endsWith('Main');
  }

  const processNameEvent = findEvent<ProcessNameEvent>(
    eventsByName,
    'process_name',
    (e) => e.pid === chunk.pid
  );
  if (processNameEvent) {
    thread.processName = processNameEvent.args.name;
  }

  // Add any process "labels" to the process name. For renderer processes, the
  // process label is often the page title of a relevant tab.
  const processLabelsEvent = findEvent<ProcessLabelsEvent>(
    eventsByName,
    'process_labels',
    (e) => e.pid === chunk.pid
  );
  if (processLabelsEvent) {
    const labels = processLabelsEvent.args.labels;
    if (thread.processName) {
      thread.processName = `${thread.processName} (${labels})`;
    } else {
      thread.processName = `Process ${chunk.pid} (${labels})`;
    }
  }

  const processSortIndexEvent = findEvent<ProcessSortIndexEvent>(
    eventsByName,
    'process_sort_index',
    (e) => e.pid === chunk.pid
  );
  let processSortIndex = 0;
  if (processSortIndexEvent) {
    processSortIndex = processSortIndexEvent.args.sort_index;
  }

  const threadSortIndexEvent = findEvent<ThreadSortIndexEvent>(
    eventsByName,
    'thread_sort_index',
    (e) => e.pid === chunk.pid && e.tid === chunk.tid
  );
  let threadSortIndex = 0;
  if (threadSortIndexEvent) {
    threadSortIndex = threadSortIndexEvent.args.sort_index;
  } else if (
    threadNameEvent &&
    (threadNameEvent.args.name === 'CrBrowserMain' ||
      threadNameEvent.args.name === 'CrGpuMain')
  ) {
    // These threads are their process's main thread but for some reason they don't always come with sort index events.
    threadSortIndex = -1;
  }

  profile.threads.push(thread);

  const nodeIdToStackId = new Map();
  nodeIdToStackId.set(undefined, null);

  const threadInfo = {
    thread,
    nodeIdToStackId,
    funcKeyToFuncId: new Map(),
    originToResourceIndex: new Map(),
    lastSeenTime: chunk.ts / 1000,
    lastSampledTime: 0,
    pid: chunk.pid,
    processSortIndex,
    threadSortIndex,
    tieBreakerIndex: threadInfoByThread.size,
  };
  threadInfoByPidAndTid.set(pidAndTid, threadInfo);
  threadInfoByThread.set(thread, threadInfo);
  return threadInfo;
}

function getTimeDeltas(
  event: ProfileChunkEvent | CpuProfileEvent
): number[] | void {
  switch (event.name) {
    case 'ProfileChunk':
      return event.args.data.timeDeltas;
    case 'CpuProfile':
      return event.args.data.cpuProfile.timeDeltas;
    default:
      return undefined;
  }
}

type FunctionInfo = {
  category: number,
  isJS: boolean,
  relevantForJS: boolean,
};

function makeFunctionInfoFinder(categories) {
  const jsCat = categories.findIndex((c) => c.name === 'JavaScript');
  const gcCat = categories.findIndex((c) => c.name === 'GC / CC');
  const nativeCat = categories.findIndex((c) => c.name === 'Native');
  const otherCat = categories.findIndex((c) => c.name === 'Other');
  const idleCat = categories.findIndex((c) => c.name === 'Idle');
  if (
    jsCat === -1 ||
    gcCat === -1 ||
    nativeCat === -1 ||
    otherCat === -1 ||
    idleCat === -1
  ) {
    throw new Error(
      'Unable to find the a category in the the defaultCategories.'
    );
  }

  return function getFunctionInfo(
    functionName,
    hasURLOrLineNumber
  ): FunctionInfo {
    switch (functionName) {
      case '(idle)':
        return { category: idleCat, isJS: false, relevantForJS: false };

      case '(root)':
      case '(program)':
        return { category: otherCat, isJS: false, relevantForJS: false };

      case '(garbage collector)':
        return { category: gcCat, isJS: false, relevantForJS: false };

      default:
        if (
          !hasURLOrLineNumber &&
          functionName !== '<WASM UNNAMED>' &&
          functionName !== '(unresolved function)'
        ) {
          return { category: nativeCat, isJS: false, relevantForJS: true };
        }
        return { category: jsCat, isJS: true, relevantForJS: false };
    }
  };
}

async function processTracingEvents(
  eventsByName: Map<string, TracingEventUnion[]>,
  profileUrl?: string
): Promise<Profile> {
  const profile = getEmptyProfile();
  profile.meta.categories = [
    { name: 'Other', color: 'grey', subcategories: ['Other'] },
    { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
    { name: 'JavaScript', color: 'yellow', subcategories: ['Other'] },
    { name: 'GC / CC', color: 'orange', subcategories: ['Other'] },
    { name: 'Graphics', color: 'green', subcategories: ['Other'] },
    { name: 'Native', color: 'blue', subcategories: ['Other'] },
  ];
  profile.meta.product = 'Chrome Trace';
  profile.meta.importedFrom = 'Chrome Trace';

  // Choose 500us as a somewhat reasonable sampling interval. When converting
  // the chrome profile, this function samples the chrome profile, and generates
  // new samples on our target interval of 500us.
  profile.meta.interval = 0.5;

  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);

  let profileEvents: (ProfileEvent | CpuProfileEvent)[] =
    (eventsByName.get('Profile'): any) || [];

  if (eventsByName.has('CpuProfile')) {
    const cpuProfiles: CpuProfileEvent[] = (eventsByName.get(
      'CpuProfile'
    ): any);
    profileEvents = profileEvents.concat(cpuProfiles);
  }

  const getFunctionInfo = makeFunctionInfoFinder(
    ensureExists(profile.meta.categories)
  );

  const threadInfoByPidAndTid = new Map();
  const threadInfoByThread = new Map();
  for (const profileEvent of profileEvents) {
    // The thread info is all of the data that makes it possible to process an
    // individual thread.
    const threadInfo = getThreadInfo(
      threadInfoByPidAndTid,
      threadInfoByThread,
      eventsByName,
      profile,
      profileEvent
    );
    const { thread, funcKeyToFuncId, nodeIdToStackId, originToResourceIndex } =
      threadInfo;

    let profileChunks = [];
    if (profileEvent.name === 'Profile') {
      threadInfo.lastSeenTime = (profileEvent.args.data.startTime: any) / 1000;
      const { id, pid } = profileEvent;
      profileChunks = findEvents<ProfileChunkEvent>(
        eventsByName,
        'ProfileChunk',
        (e) => e.id === id && e.pid === pid
      );
    } else if (profileEvent.name === 'CpuProfile') {
      // Assume profiling starts exactly on profile start time.
      threadInfo.lastSeenTime = profile.meta.profilingStartTime =
        profileEvent.args.data.cpuProfile.startTime / 1000;
      profile.meta.profilingEndTime =
        profileEvent.args.data.cpuProfile.endTime / 1000;

      profileChunks = [profileEvent];
    }

    for (const profileChunk of profileChunks) {
      if (!profileChunk.args.data || !profileChunk.args.data.cpuProfile) {
        // This is probably a FallbackEndEvent, ignore it instead of crashing.
        continue;
      }

      const { cpuProfile } = profileChunk.args.data;
      const { nodes, samples } = cpuProfile;
      const timeDeltas = getTimeDeltas(profileChunk);
      if (!timeDeltas) {
        continue;
      }

      const {
        funcTable,
        frameTable,
        stackTable,
        samples: samplesTable,
        resourceTable,
      } = thread;

      if (nodes) {
        const parentMap = new Map();
        for (const node of nodes) {
          const { callFrame, id: nodeIndex } = node;
          let parent: number | void = undefined;
          if (node.parent !== undefined) {
            parent = (node.parent: any);
          } else {
            parent = parentMap.get(nodeIndex);
          }
          if (node.children !== undefined) {
            const children: number[] = (node.children: any);
            for (let i = 0; i < children.length; i++) {
              parentMap.set(children[i], nodeIndex);
            }
          }

          // Canonicalize frame info. The way "no data" is expressed changed a bit
          // between different Chrome profile versions.
          let { url, lineNumber, columnNumber } = callFrame;
          if (lineNumber === -1) {
            lineNumber = undefined;
          }

          if (columnNumber === -1) {
            columnNumber = undefined;
          }

          // Line and column number are zero-based in chrome profiles, but
          // 1-based in the firefox profiler.
          if (lineNumber !== undefined) {
            lineNumber++;
          }
          if (columnNumber !== undefined) {
            columnNumber++;
          }

          if (url === '') {
            url = undefined;
          }

          const { functionName } = callFrame;
          const funcKey = `${functionName}:${url || ''}:${lineNumber || 0}:${
            columnNumber || 0
          }`;
          const { category, isJS, relevantForJS } = getFunctionInfo(
            functionName,
            url !== undefined || lineNumber !== undefined
          );
          let funcId = funcKeyToFuncId.get(funcKey);

          if (funcId === undefined) {
            // The function did not exist.
            funcId = funcTable.length++;
            funcTable.isJS.push(isJS);
            funcTable.relevantForJS.push(relevantForJS);
            const name = functionName !== '' ? functionName : '(anonymous)';
            funcTable.name.push(stringTable.indexForString(name));
            funcTable.resource.push(
              isJS
                ? getOrCreateURIResource(
                    url || '<unknown>',
                    resourceTable,
                    stringTable,
                    originToResourceIndex
                  )
                : -1
            );
            funcTable.fileName.push(
              isJS ? stringTable.indexForString(url || '<unknown>') : null
            );
            funcTable.lineNumber.push(
              lineNumber === undefined ? null : lineNumber
            );
            funcTable.columnNumber.push(
              columnNumber === undefined ? null : columnNumber
            );
            funcKeyToFuncId.set(funcKey, funcId);
          }

          // Node indexes start at 1, while frame indexes start at 0.
          const frameIndex = nodeIndex - 1;
          const prefixStackIndex = nodeIdToStackId.get(parent);
          if (prefixStackIndex === undefined) {
            throw new Error(
              'Unable to find the prefix stack index from a node index.'
            );
          }
          frameTable.address[frameIndex] = -1;
          frameTable.category[frameIndex] = category;
          frameTable.subcategory[frameIndex] = 0;
          frameTable.func[frameIndex] = funcId;
          frameTable.nativeSymbol[frameIndex] = null;
          frameTable.innerWindowID[frameIndex] = 0;
          frameTable.line[frameIndex] =
            lineNumber === undefined ? null : lineNumber;
          frameTable.column[frameIndex] =
            columnNumber === undefined ? null : columnNumber;
          frameTable.length = Math.max(frameTable.length, frameIndex + 1);

          stackTable.frame.push(frameIndex);
          stackTable.prefix.push(prefixStackIndex);
          nodeIdToStackId.set(nodeIndex, stackTable.length++);
        }
      }

      // Chrome profiles sample much more frequently than Gecko ones do, and they store
      // the time delta between each sampling event. In order to properly reconstruct
      // the data using our fixed-time intervals, sample the data at a fixed rate that
      // is most likely slightly higher. Chrome profiles have been observed sampling
      // between 100us to 300us. Reconstruct the profile at 500us, which is a somewhat
      // reasonable interval.

      for (let i = 0; i < samples.length; i++) {
        const nodeIndex = samples[i];
        // Convert to milliseconds:
        threadInfo.lastSeenTime += timeDeltas[i] / 1000;
        if (
          threadInfo.lastSeenTime - threadInfo.lastSampledTime >=
          profile.meta.interval
        ) {
          threadInfo.lastSampledTime = threadInfo.lastSeenTime;
          const stackIndex = ensureExists(
            nodeIdToStackId.get(nodeIndex),
            'Could not find the stack information for a sample when decoding a Chrome profile.'
          );
          ensureExists(
            samplesTable.eventDelay,
            'Could not find the eventDelay in samplesTable inside the newly created Chrome profile thread.'
          ).push(null);
          samplesTable.stack.push(stackIndex);
          ensureExists(samplesTable.time).push(threadInfo.lastSampledTime);
          samplesTable.length++;
        }
      }
    }
  }

  for (const thread of profile.threads) {
    assertStackOrdering(thread.stackTable);
  }

  await extractScreenshots(
    threadInfoByPidAndTid,
    threadInfoByThread,
    eventsByName,
    profile,
    (eventsByName.get('Screenshot'): any)
  );

  extractMarkers(
    threadInfoByPidAndTid,
    threadInfoByThread,
    eventsByName,
    profile
  );

  // Figure out the profiling start and end times if they haven't been found yet.
  // CpuProfile traces would have already found and updated this, we should do
  // it for the other tracing formats only.
  if (
    profile.meta.profilingStartTime === undefined &&
    profile.meta.profilingEndTime === undefined &&
    eventsByName.has('TracingStartedInBrowser')
  ) {
    const tracingStartedEvent = ensureExists(
      eventsByName.get('TracingStartedInBrowser')
    )[0];
    if (
      tracingStartedEvent.ts !== undefined &&
      Number.isFinite(tracingStartedEvent.ts)
    ) {
      // We know the start easily, but we have to compute the end time.
      let profilingEndTime = -Infinity;

      profile.threads.forEach((thread) => {
        const threadRange = getTimeRangeForThread(
          thread,
          profile.meta.interval
        );
        profilingEndTime = Math.max(profilingEndTime, threadRange.end);
      });

      profile.meta.profilingStartTime = tracingStartedEvent.ts / 1000;
      profile.meta.profilingEndTime = profilingEndTime;
    }
  }

  if (profileUrl) {
    // Get profile start time from profile URL if available. Timestamp format is what
    // is generated by the Chrome DevTools UI when saving profiles. Technically, that
    // timestamp is of profile save instead of profile start, but one can generate a
    // more accurate start timestamp through e.g. handling the Chrome DevTools
    // Protocol `Profiler.consoleProfileStarted` event.
    const timeStampRe = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/g;
    let match;
    let curMatch;
    // Find the last match in case there are more timestamps in the path.
    while ((curMatch = timeStampRe.exec(profileUrl)) !== null) {
      match = curMatch;
    }
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const dateTimeString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      const startTime = new Date(dateTimeString);
      profile.meta.startTime =
        startTime.getTime() - (profile.meta.profilingStartTime ?? 0);
    }
  }

  profile.threads.sort((threadA, threadB) => {
    const threadInfoA = threadInfoByThread.get(threadA);
    const threadInfoB = threadInfoByThread.get(threadB);
    if (!threadInfoA || !threadInfoB) {
      console.error({ threadA, threadB });
      throw new Error('Unexpected thread');
    }
    if (threadInfoA.pid === threadInfoB.pid) {
      if (threadInfoA.threadSortIndex !== threadInfoB.threadSortIndex) {
        return threadInfoA.threadSortIndex - threadInfoB.threadSortIndex;
      }
    } else {
      if (threadInfoA.processSortIndex !== threadInfoB.processSortIndex) {
        return threadInfoA.processSortIndex - threadInfoB.processSortIndex;
      }
    }
    return threadInfoA.tieBreakerIndex - threadInfoB.tieBreakerIndex;
  });

  return profile;
}

async function extractScreenshots(
  threadInfoByPidAndTid: Map<string, ThreadInfo>,
  threadInfoByThread: Map<RawThread, ThreadInfo>,
  eventsByName: Map<string, TracingEventUnion[]>,
  profile: Profile,
  screenshots: ?(ScreenshotEvent[])
): Promise<void> {
  if (!screenshots) {
    return;
  }

  if (!screenshots || screenshots.length === 0) {
    // No screenshots were found, exit early.
    return;
  }
  const { thread } = getThreadInfo(
    threadInfoByPidAndTid,
    threadInfoByThread,
    eventsByName,
    profile,
    screenshots[0]
  );

  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);

  const graphicsIndex = ensureExists(profile.meta.categories).findIndex(
    (category) => category.name === 'Graphics'
  );

  if (graphicsIndex === -1) {
    throw new Error(
      "Could not find the Graphics category in the profile's category list."
    );
  }

  for (const screenshot of screenshots) {
    const urlString = 'data:image/jpg;base64,' + screenshot.args.snapshot;
    const size = await getImageSize(urlString);
    if (size === null) {
      // The image could not be processed, do not add it.
      continue;
    }
    thread.markers.data.push({
      type: 'CompositorScreenshot',
      url: stringTable.indexForString(urlString),
      windowID: 'id',
      windowWidth: size.width,
      windowHeight: size.height,
    });
    thread.markers.name.push(
      stringTable.indexForString('CompositorScreenshot')
    );
    thread.markers.startTime.push(screenshot.ts / 1000);
    thread.markers.endTime.push(null);
    thread.markers.phase.push(INSTANT);
    thread.markers.category.push(graphicsIndex);
    thread.markers.length++;
  }
}

/**
 * Decode a base64 image, and extract the width and height values. These are pre-computed
 * for Gecko profiles, but not for Chrome profiles.
 */
function getImageSize(
  url: string
): Promise<null | {| width: number, height: number |}> {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = url;

    image.addEventListener('load', () => {
      resolve({
        width: image.width,
        height: image.height,
      });
    });

    image.addEventListener('error', () => {
      resolve(null);
    });
  });
}

/**
 * For sanity, check that stacks are ordered where the prefix stack
 * always preceeds the current stack index in the StackTable.
 */
function assertStackOrdering(stackTable: RawStackTable) {
  const visitedStacks = new Set([null]);
  for (let i = 0; i < stackTable.length; i++) {
    if (!visitedStacks.has(stackTable.prefix[i])) {
      throw new Error('The stack ordering is incorrect');
    }
    visitedStacks.add(i);
  }
}

/**
 * Create profile markers for events which are "Complete", "Duration" or "Instant" events.
 */
function extractMarkers(
  threadInfoByPidAndTid: Map<string, ThreadInfo>,
  threadInfoByThread: Map<RawThread, ThreadInfo>,
  eventsByName: Map<string, TracingEventUnion[]>,
  profile: Profile
) {
  const otherCategoryIndex = ensureExists(profile.meta.categories).findIndex(
    (category) => category.name === 'Other'
  );
  if (otherCategoryIndex === -1) {
    throw new Error('No "Other" category in empty profile category list');
  }

  const stringTable = StringTable.withBackingArray(profile.shared.stringArray);

  profile.meta.markerSchema = [
    {
      name: 'EventDispatch',
      chartLabel: '{marker.data.type2}',
      tooltipLabel: '{marker.data.type2} - EventDispatch',
      tableLabel: '{marker.data.type2}',
      display: ['marker-chart', 'marker-table', 'timeline-overview'],
      fields: [
        {
          // In the original chrome profile, the key is `type`, but we rename it
          // so that it doesn't clash with our internal `type` property.
          key: 'type2',
          label: 'Event Type',
          format: 'string',
        },
      ],
    },
  ];

  for (const [name, events] of eventsByName.entries()) {
    if (
      name === 'Profile' ||
      name === 'ProfileChunk' ||
      name === 'CpuProfile'
    ) {
      // Don't convert these to markers because we'd be duplicating information
      // and bloat the profile.
      continue;
    }

    for (const event of events) {
      // For all event types, require a timestamp value that's a finite number.
      if (event.ts === undefined || !Number.isFinite(event.ts)) {
        continue;
      }

      // For Complete ('X') events, require a duration.
      // Other events do not require any extra fields.
      if (
        // Complete events
        (event.ph === 'X' &&
          event.dur !== undefined &&
          Number.isFinite(event.dur)) ||
        // Duration events
        event.ph === 'B' ||
        event.ph === 'E' ||
        // Async events
        event.ph === 'b' ||
        event.ph === 'n' ||
        event.ph === 'e' ||
        // Instant events
        event.ph === 'i' ||
        event.ph === 'I' ||
        // Mark events
        event.ph === 'R'
      ) {
        const time: number = (event.ts: any) / 1000;
        const threadInfo = getThreadInfo(
          threadInfoByPidAndTid,
          threadInfoByThread,
          eventsByName,
          profile,
          event
        );
        const { thread } = threadInfo;
        const { markers } = thread;
        let argData: MixedObject | null = null;
        if (event.args && typeof event.args === 'object') {
          argData = (event.args: any).data || null;
        }
        markers.name.push(stringTable.indexForString(name));
        markers.category.push(otherCategoryIndex);

        if (argData && 'type' in argData) {
          argData.type2 = argData.type;
        }
        if (argData && 'category' in argData) {
          argData.category2 = argData.category;
        }

        const newData = {
          ...argData,
          type: name,
          category: event.cat,
        };

        // $FlowExpectError Opt out of Flow checking for this one.
        markers.data.push(newData);

        if (event.ph === 'X') {
          // Complete Event
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.lpfof2aylapb
          const duration: number = (event.dur: any) / 1000;
          markers.phase.push(INTERVAL);
          markers.startTime.push(time);
          markers.endTime.push(time + duration);
        } else if (event.ph === 'B' || event.ph === 'b') {
          // Duration or Async Event Begin
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.nso4gcezn7n1
          // The 'B' and 'b' phases stand for "begin", and is the Chrome equivalent of IntervalStart.
          markers.startTime.push(time);
          markers.endTime.push(null);
          markers.phase.push(INTERVAL_START);
        } else if (event.ph === 'E' || event.ph === 'e') {
          // Duration or Async Event End
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.nso4gcezn7n1
          // The 'E' and 'e' phase stand for "end", and is the Chrome equivalent of IntervalEnd.
          markers.startTime.push(null);
          markers.endTime.push(time);
          markers.phase.push(INTERVAL_END);
        } else {
          // Instant Event
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.lenwiilchoxp
          // This assumes the phase is 'I' or 'i' (Instant), 'n' (Async Instant)
          // or 'R' (Mark events)
          markers.startTime.push(time);
          markers.endTime.push(null);
          markers.phase.push(INSTANT);
        }
        markers.length++;
      }
    }
  }
}
