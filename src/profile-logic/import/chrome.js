/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import type {
  Profile,
  StackTable,
  Thread,
  IndexIntoFuncTable,
  IndexIntoStackTable,
  IndexIntoResourceTable,
} from '../../types/profile';

import {
  getEmptyProfile,
  getEmptyThread,
} from '../../profile-logic/data-structures';
import { ensureExists } from '../../utils/flow';

import { getOrCreateURIResource } from '../../profile-logic/profile-data';

// Chrome Tracing Event Spec:
// https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview

type TracingEventUnion = ProfileChunkEvent | CpuProfileEvent | ThreadNameEvent;

type TracingEvent<Event> = {|
  cat: string,
  id: string,
  // List out all known phase values, but then also allow strings. This will get
  // overwritten by the `...Event` line, which will put in the exact phase.
  ph: string, // Phase
  pid: number, // Process ID
  tid: number, // Thread ID
  ts: number, // Timestamp
  tdur?: number, // Time duration
  dur?: number, // Time duration
  ...Event,
|};

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
|}>;

// The CpuProfileEvent format is similar to the ProfileChunkEvent format.
// Presumably, one of them is the newer format the other is the older format.
// The differences are:
//  - The timeDeltas field is in a different place in the structure
//  - The parent <-> child relationship between nodes is indicated in the
//    opposite direction: ProfileChunkEvent has a "parent" field on each nodes,
//    CpuProfileEvent has a "children" field on each node.
type CpuProfileEvent = TracingEvent<{|
  name: 'CpuProfile',
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
          children?: number[],
        }>,
        samples: number[], // Index into cpuProfile nodes
        timeDeltas: number[],
        startTime: number,
        endTime: number,
      },
    },
  },
  ph: 'I',
|}>;

type ThreadNameEvent = TracingEvent<{|
  name: 'thread_name',
  ph: 'm',
  args: { name: string },
|}>;

type ScreenshotEvent = TracingEvent<{|
  name: 'Screenshot',
  ph: 'O',
  args: { snapshot: string },
|}>;

export function isChromeProfile(profile: mixed): boolean {
  if (!Array.isArray(profile)) {
    return false;
  }
  const event = profile[0];
  // Lightly check that some properties exist that are in the TracingEvent.
  return (
    typeof event === 'object' &&
    event !== null &&
    'ph' in event &&
    'cat' in event &&
    'args' in event
  );
}

export function convertChromeProfile(profile: mixed): Promise<Profile> {
  if (!Array.isArray(profile)) {
    throw new Error(
      'Expected an array when attempting to convert a Chrome profile.'
    );
  }
  const eventsByName: Map<string, TracingEventUnion[]> = new Map();
  for (const tracingEvent of profile) {
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
  return processTracingEvents(eventsByName);
}

type ThreadInfo = {
  thread: Thread,
  funcKeyToFuncId: Map<string, IndexIntoFuncTable>,
  nodeIdToStackId: Map<number | void, IndexIntoStackTable | null>,
  originToResourceIndex: Map<string, IndexIntoResourceTable>,
  lastSeenTime: number,
  lastSampledTime: number,
};

function getThreadInfo<T: Object>(
  threadInfoByTid: Map<number, ThreadInfo>,
  eventsByName: Map<string, TracingEventUnion[]>,
  profile: Profile,
  chunk: TracingEvent<T>
): ThreadInfo {
  const cachedThreadInfo = threadInfoByTid.get(chunk.tid);
  if (cachedThreadInfo) {
    return cachedThreadInfo;
  }
  const thread = getEmptyThread();
  thread.pid = chunk.pid;
  thread.tid = chunk.tid;

  // Attempt to find a name for this thread:
  thread.name = 'Chrome Thread';
  const threadNameChunks: ThreadNameEvent[] | void = (eventsByName.get(
    'thread_name'
  ): any);

  if (threadNameChunks) {
    const threadNameChunk = threadNameChunks.find(
      thread => thread.tid === chunk.tid
    );
    if (threadNameChunk) {
      thread.name = threadNameChunk.args.name;
    }
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
  };
  threadInfoByTid.set(chunk.tid, threadInfo);
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
  const jsCat = categories.findIndex(c => c.name === 'JavaScript');
  const gcCat = categories.findIndex(c => c.name === 'GC / CC');
  const domCat = categories.findIndex(c => c.name === 'DOM');
  const otherCat = categories.findIndex(c => c.name === 'Other');
  const idleCat = categories.findIndex(c => c.name === 'Idle');
  if (
    jsCat === -1 ||
    gcCat === -1 ||
    domCat === -1 ||
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
          return { category: domCat, isJS: false, relevantForJS: true };
        }
        return { category: jsCat, isJS: true, relevantForJS: false };
    }
  };
}

async function processTracingEvents(
  eventsByName: Map<string, TracingEventUnion[]>
): Promise<Profile> {
  const profile = getEmptyProfile();
  let profileEvents: (ProfileChunkEvent | CpuProfileEvent)[] =
    (eventsByName.get('ProfileChunk'): any) || [];

  if (eventsByName.has('CpuProfile')) {
    const cpuProfiles: CpuProfileEvent[] = (eventsByName.get(
      'CpuProfile'
    ): any);
    profileEvents = profileEvents.concat(cpuProfiles);
  }

  const getFunctionInfo = makeFunctionInfoFinder(profile.meta.categories);

  const threadInfoByTid = new Map();
  for (const chunkOrCpuProfileEvent of profileEvents) {
    // The thread info is all of the data that makes it possible to process an
    // individual thread.
    const threadInfo = getThreadInfo(
      threadInfoByTid,
      eventsByName,
      profile,
      chunkOrCpuProfileEvent
    );
    const {
      thread,
      funcKeyToFuncId,
      nodeIdToStackId,
      originToResourceIndex,
    } = threadInfo;
    const { cpuProfile } = chunkOrCpuProfileEvent.args.data;
    const { nodes, samples } = cpuProfile;
    const timeDeltas = getTimeDeltas(chunkOrCpuProfileEvent);
    if (!timeDeltas) {
      continue;
    }

    if (cpuProfile.startTime !== undefined) {
      threadInfo.lastSeenTime = (cpuProfile.startTime: any) / 1000;
    }

    const {
      funcTable,
      frameTable,
      stackTable,
      stringTable,
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
        if (url === '') {
          url = undefined;
        }

        const { functionName } = callFrame;
        const funcKey = `${functionName}:${url || ''}:${lineNumber ||
          0}:${columnNumber || 0}`;
        const { category, isJS, relevantForJS } = getFunctionInfo(
          functionName,
          url !== undefined || lineNumber !== undefined
        );
        let funcId = funcKeyToFuncId.get(funcKey);

        if (funcId === undefined) {
          // The function did not exist.
          funcId = funcTable.length++;
          funcTable.address.push(-1);
          funcTable.isJS.push(isJS);
          funcTable.relevantForJS.push(relevantForJS);
          const name = functionName !== '' ? functionName : '(anonymous)';
          funcTable.name.push(stringTable.indexForString(name));
          funcTable.resource.push(
            url === undefined
              ? -1
              : getOrCreateURIResource(
                  url,
                  resourceTable,
                  stringTable,
                  originToResourceIndex
                )
          );
          funcTable.fileName.push(
            url === undefined ? null : stringTable.indexForString(url)
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
        frameTable.innerWindowID[frameIndex] = 0;
        frameTable.implementation[frameIndex] = null;
        frameTable.line[frameIndex] =
          lineNumber === undefined ? null : lineNumber;
        frameTable.column[frameIndex] =
          columnNumber === undefined ? null : columnNumber;
        frameTable.optimizations[frameIndex] = null;
        frameTable.length = Math.max(frameTable.length, frameIndex + 1);

        stackTable.frame.push(frameIndex);
        stackTable.category.push(category);
        stackTable.subcategory.push(0);
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

    // Choose 500us as a somewhat reasonable sampling interval. When converting
    // the chrome profile, this function samples the chrome profile, and generates
    // new samples on our target interval of 500us.
    profile.meta.interval = 0.5;

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
        samplesTable.time.push(threadInfo.lastSampledTime);
        samplesTable.length++;
      }
    }
  }

  for (const thread of profile.threads) {
    assertStackOrdering(thread.stackTable);
  }

  await extractScreenshots(
    threadInfoByTid,
    eventsByName,
    profile,
    (eventsByName.get('Screenshot'): any)
  );

  extractMarkers(threadInfoByTid, eventsByName, profile);

  return profile;
}

async function extractScreenshots(
  threadInfoByTid: Map<number, ThreadInfo>,
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
    threadInfoByTid,
    eventsByName,
    profile,
    screenshots[0]
  );

  const graphicsIndex = profile.meta.categories.findIndex(
    category => category.name === 'Graphics'
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
      url: thread.stringTable.indexForString(urlString),
      windowID: 'id',
      windowWidth: size.width,
      windowHeight: size.height,
    });
    thread.markers.name.push(
      thread.stringTable.indexForString('CompositorScreenshot')
    );
    thread.markers.time.push(screenshot.ts / 1000);
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
  return new Promise(resolve => {
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
function assertStackOrdering(stackTable: StackTable) {
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
  threadInfoByTid: Map<number, ThreadInfo>,
  eventsByName: Map<string, TracingEventUnion[]>,
  profile: Profile
) {
  const otherCategoryIndex = profile.meta.categories.findIndex(
    category => category.name === 'Other'
  );
  if (otherCategoryIndex === -1) {
    throw new Error('No "Other" category in empty profile category list');
  }

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
      // Duration events ('B' and 'E') as well as Instant events ('I') do not
      // require any extra fields.
      if (
        (event.ph === 'X' &&
          event.dur !== undefined &&
          Number.isFinite(event.dur)) ||
        event.ph === 'B' ||
        event.ph === 'E' ||
        event.ph === 'I'
      ) {
        const time: number = (event.ts: any) / 1000;
        const threadInfo = getThreadInfo(
          threadInfoByTid,
          eventsByName,
          profile,
          event
        );
        const { thread } = threadInfo;
        const { markers, stringTable } = thread;
        let argData: Object | null = null;
        if (event.args && typeof event.args === 'object') {
          argData = (event.args: any).data || null;
        }
        markers.time.push(time);
        markers.name.push(stringTable.indexForString(name));
        markers.category.push(otherCategoryIndex);
        if (event.ph === 'X') {
          // Complete Event
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.lpfof2aylapb
          const duration: number = (event.dur: any) / 1000;
          markers.data.push({
            type: 'CompleteTraceEvent',
            category: event.cat,
            data: argData,
            startTime: time,
            endTime: time + duration,
          });
        } else if (event.ph === 'B' || event.ph === 'E') {
          // Duration Event
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.nso4gcezn7n1
          markers.data.push({
            type: 'tracing',
            category: event.cat,
            interval: event.ph === 'B' ? 'start' : 'end',
            data: argData,
          });
        } else if (event.ph === 'I') {
          // Instant Event
          // https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview#heading=h.lenwiilchoxp
          markers.data.push({
            type: 'InstantTraceEvent',
            category: event.cat,
            data: argData,
            startTime: time,
            endTime: time,
          });
        }
        markers.length++;
      }
    }
  }
}
