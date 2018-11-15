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
} from '../../types/profile';

import { getEmptyProfile } from '../../profile-logic/profile-data';
import { getEmptyThread } from '../../test/fixtures/profiles/make-profile';
import { ensureExists } from '../../utils/flow';

// Chrome Tracing Event Spec:
// https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview

type TracingEventUnion = ProfileChunkEvent | ThreadNameEvent;

type TracingEvent<Event> = {|
  cat: string,
  id: string,
  // List out all known phase values, but then also allow strings. This will get
  // overwritten by the `...Event` line, which will put in the exact phase.
  ph: string, // Phase
  pid: number, // Process ID
  tid: number, // Thread ID
  ts: number, // Timestamp
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
    lastSeenTime: chunk.ts / 1000,
    lastSampledTime: 0,
  };
  threadInfoByTid.set(chunk.tid, threadInfo);
  return threadInfo;
}

async function processTracingEvents(
  eventsByName: Map<string, TracingEventUnion[]>
): Promise<Profile> {
  const profile = getEmptyProfile();
  const profileChunks: ProfileChunkEvent[] =
    (eventsByName.get('ProfileChunk'): any) || [];
  const javascriptCategoryIndex = profile.meta.categories.findIndex(
    category => category.name === 'JavaScript'
  );
  if (javascriptCategoryIndex === -1) {
    throw new Error(
      'Unable to find the JavaScript category in the the defaultCategories.'
    );
  }

  const threadInfoByTid = new Map();
  for (const chunk of profileChunks) {
    // The thread info is all of the data that makes it possible to process an
    // individual thread.
    const threadInfo = getThreadInfo(
      threadInfoByTid,
      eventsByName,
      profile,
      chunk
    );
    const { thread, funcKeyToFuncId, nodeIdToStackId } = threadInfo;
    const { cpuProfile: { nodes, samples }, timeDeltas } = chunk.args.data;
    const {
      funcTable,
      frameTable,
      stackTable,
      stringTable,
      samples: samplesTable,
    } = thread;

    if (nodes) {
      for (const { callFrame, id: nodeIndex, parent } of nodes) {
        const { functionName, url, lineNumber, columnNumber } = callFrame;
        const funcKey = `${functionName}:${url || ''}:${lineNumber ||
          ''}:${columnNumber || ''}`;
        let funcId = funcKeyToFuncId.get(funcKey);

        if (funcId === undefined) {
          // The function did not exist.
          funcId = funcTable.length++;
          funcTable.address.push(0);
          funcTable.isJS.push(true);
          funcTable.relevantForJS.push(false);
          funcTable.name.push(stringTable.indexForString(functionName));
          funcTable.resource.push(-1);
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
        frameTable.address[frameIndex] = stringTable.indexForString('');
        frameTable.category[frameIndex] = javascriptCategoryIndex;
        frameTable.func[frameIndex] = funcId;
        frameTable.implementation[frameIndex] = null;
        frameTable.line[frameIndex] =
          lineNumber === undefined ? null : lineNumber;
        frameTable.column[frameIndex] =
          columnNumber === undefined ? null : columnNumber;
        frameTable.optimizations[frameIndex] = null;
        frameTable.length = Math.max(frameTable.length, frameIndex + 1);

        stackTable.frame.push(frameIndex);
        stackTable.category.push(javascriptCategoryIndex);
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
        samplesTable.responsiveness.push(null);
        samplesTable.stack.push(stackIndex);
        samplesTable.time.push(threadInfo.lastSampledTime);
        samplesTable.rss.push(null);
        samplesTable.uss.push(null);
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
