/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// TODO Combine yields/starts that are closer than some threshold with the previous event to reduce renders.

export default function reactProfilerProcessor(rawData) {
  // Filter null entries and sort by timestamp.
  // I would not expect to have to do either of this,
  // but some of the data being passed in requires it.
  rawData = rawData
    .filter(Boolean)
    .filter(d => d.type === 'UserTiming' && d.name.startsWith('--'))
    .sort((a, b) => (a.startTime > b.startTime ? 1 : -1));

  if (rawData.length === 0) {
    return null;
  }

  const processedData = {
    // Prioritized "events" marked by React and Scheduler packages:
    high: {
      events: [],
      work: [],
    },
    normal: {
      events: [],
      work: [],
    },
    low: {
      events: [],
      work: [],
    },
    unscheduled: {
      events: [],
      work: [],
    },
  };

  let currentMetadata = null;
  let currentPriority = null;
  let currentProcessedGroup = null;
  let uidCounter = 0;

  const metadata = {
    high: {
      nextRenderShouldGenerateNewBatchID: true,
      batchUID: null,
      stack: [],
    },
    normal: {
      nextRenderShouldGenerateNewBatchID: true,
      batchUID: null,
      stack: [],
    },
    low: {
      nextRenderShouldGenerateNewBatchID: true,
      batchUID: null,
      stack: [],
    },
    unscheduled: {
      nextRenderShouldGenerateNewBatchID: true,
      batchUID: null,
      stack: [],
    },
  };

  const getLastType = () => {
    const { stack } = currentMetadata;
    if (stack.length > 0) {
      const { type } = stack[stack.length - 1];
      return type;
    }
    return null;
  };

  const getDepth = () => {
    const { stack } = currentMetadata;
    if (stack.length > 0) {
      const { depth, type } = stack[stack.length - 1];
      return type === 'render-idle' ? depth : depth + 1;
    }
    return 0;
  };

  const markWorkCompleted = (type, stopTime) => {
    const { stack } = currentMetadata;
    if (stack.length === 0) {
      console.error(
        `Unexpected type "${type}" completed while stack is empty.`
      );
    } else {
      const last = stack[stack.length - 1];
      if (last.type !== type) {
        console.error(
          `Unexpected type "${type}" completed before "${last.type}" completed.`
        );
      } else {
        const { index, startTime } = stack.pop();

        const work = currentProcessedGroup.work[index];
        if (!work) {
          console.error(
            `Could not find matching work entry for type "${type}".`
          );
        } else {
          work.duration = stopTime - startTime;
        }
      }
    }
  };

  const markWorkStarted = (type, startTime) => {
    const { batchUID, stack } = currentMetadata;

    const index = currentProcessedGroup.work.length;
    const depth = getDepth();

    stack.push({
      depth,
      index,
      startTime,
      type,
    });

    currentProcessedGroup.work.push({
      type,
      batchUID,
      depth,
      priority: currentPriority,
      timestamp: startTime,
    });
  };

  const throwIfIncomplete = type => {
    const { stack } = currentMetadata;
    const lastIndex = stack.length - 1;
    if (lastIndex >= 0) {
      const last = stack[lastIndex];
      if (last.stopTime === undefined && last.type === type) {
        throw new Error(
          `Unexpected type "${type}" started before "${last.type}" completed.`
        );
      }
    }
  };

  for (let i = 0; i < rawData.length; i++) {
    const currentEvent = rawData[i];

    if (
      currentEvent.type !== 'UserTiming' ||
      !currentEvent.name.startsWith('--')
    ) {
      continue;
    }

    currentMetadata = metadata[currentPriority || 'unscheduled'];
    if (!currentMetadata) {
      console.error('Unexpected priority', currentPriority);
    }

    currentProcessedGroup = processedData[currentPriority || 'unscheduled'];
    if (!currentProcessedGroup) {
      console.error('Unexpected priority', currentPriority);
    }

    const { name, startTime } = currentEvent;

    if (name.startsWith('--scheduler-start-')) {
      if (currentPriority !== null) {
        console.error(
          `Unexpected scheduler start: "${name}" with current priority: "${currentPriority}"`
        );
        continue; // TODO Should we throw? Will this corrupt our data?
      }

      currentPriority = name.substr(18);
    } else if (name.startsWith('--scheduler-stop-')) {
      if (currentPriority === null || currentPriority !== name.substr(17)) {
        console.error(
          `Unexpected scheduler stop: "${name}" with current priority: "${currentPriority}"`
        );
        continue; // TODO Should we throw? Will this corrupt our data?
      }

      currentPriority = null;
    } else if (name === '--render-start') {
      if (currentMetadata.nextRenderShouldGenerateNewBatchID) {
        currentMetadata.nextRenderShouldGenerateNewBatchID = false;
        currentMetadata.batchUID = uidCounter++;
      }
      throwIfIncomplete('render-work');
      if (getLastType() !== 'render-idle') {
        markWorkStarted('render-idle', startTime);
      }
      markWorkStarted('render-work', startTime);
    } else if (name === '--render-stop') {
      markWorkCompleted('render-work', startTime);
    } else if (name === '--render-yield') {
      markWorkCompleted('render-work', startTime);
    } else if (name === '--render-cancel') {
      currentMetadata.nextRenderShouldGenerateNewBatchID = true;
      markWorkCompleted('render-work', startTime);
      markWorkCompleted('render-idle', startTime);
    } else if (name === '--commit-start') {
      currentMetadata.nextRenderShouldGenerateNewBatchID = true;
      markWorkStarted('commit-work', startTime);
    } else if (name === '--commit-stop') {
      markWorkCompleted('commit-work', startTime);
      markWorkCompleted('render-idle', startTime);
    } else if (
      name === '--layout-effects-start' ||
      name === '--passive-effects-start'
    ) {
      const type =
        name === '--layout-effects-start'
          ? 'layout-effects'
          : 'passive-effects';
      throwIfIncomplete(type);
      markWorkStarted(type, startTime);
    } else if (
      name === '--layout-effects-stop' ||
      name === '--passive-effects-stop'
    ) {
      const type =
        name === '--layout-effects-stop' ? 'layout-effects' : 'passive-effects';
      markWorkCompleted(type, startTime);
    } else if (name.startsWith('--schedule-render')) {
      currentProcessedGroup.events.push({
        type: 'schedule-render',
        priority: currentPriority, // TODO Change to target priority
        timestamp: startTime,
      });
    } else if (name.startsWith('--schedule-state-update-')) {
      const [componentName, componentStack] = name.substr(24).split('-');
      const isCascading = !!currentMetadata.stack.find(
        ({ type }) => type === 'commit-work'
      );
      currentProcessedGroup.events.push({
        type: 'schedule-state-update',
        priority: currentPriority, // TODO Change to target priority
        isCascading,
        timestamp: startTime,
        componentName,
        componentStack,
      });
    } else if (name.startsWith('--suspend-')) {
      const [componentName, componentStack] = name.substr(10).split('-');
      currentProcessedGroup.events.push({
        type: 'suspend',
        timestamp: startTime,
        componentName,
        componentStack,
      });
    }
  }

  Object.entries(metadata).forEach(([priority, metadata]) => {
    const { stack } = metadata;
    if (stack.length > 0) {
      console.error(`Incomplete work entries for priority ${priority}`, stack);
    }
  });

  return processedData;
}
