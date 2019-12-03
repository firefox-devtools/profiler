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
      reactWork: [],
      reactEvents: [],
    },
    normal: {
      reactWork: [],
      reactEvents: [],
    },
    low: {
      reactWork: [],
      reactEvents: [],
    },
    unscheduled: {
      reactWork: [],
      reactEvents: [],
    },
  };

  const metadata = {
    high: {
      hasInProgressCommit: false,
      hasUncommittedWork: false,
      previousStartTime: null,
      previousStopTime: null,
    },
    normal: {
      hasInProgressCommit: false,
      hasUncommittedWork: false,
      previousStartTime: null,
      previousStopTime: null,
    },
    low: {
      hasInProgressCommit: false,
      hasUncommittedWork: false,
      previousStartTime: null,
      previousStopTime: null,
    },
    unscheduled: {
      hasInProgressCommit: false,
      hasUncommittedWork: false,
      previousStartTime: null,
      previousStopTime: null,
    },
  };

  let currentPriority = null;

  // TODO (brian) Re-implement this to use a per-priority stack (where things get started/stopped each time the stack is:
  // 1. pushed with a length > 0
  // 2. popped

  for (let i = 0; i < rawData.length; i++) {
    const currentEvent = rawData[i];

    if (
      currentEvent.type !== 'UserTiming' ||
      !currentEvent.name.startsWith('--')
    ) {
      continue;
    }

    const currentMetadata = metadata[currentPriority || 'unscheduled'];
    if (!currentMetadata) {
      console.warn('Unexpected priority', currentPriority);
    }

    const currentProcessedGroup =
      processedData[currentPriority || 'unscheduled'];
    if (!currentProcessedGroup) {
      console.warn('Unexpected priority', currentPriority);
    }

    const { name, startTime } = currentEvent;

    const timestamp = startTime;

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
      if (currentMetadata.previousStartTime !== null) {
        console.warn('Unexpected render start');
      }

      if (
        currentMetadata.hasUncommittedWork &&
        currentMetadata.previousStopTime !== null
      ) {
        currentProcessedGroup.reactWork.push({
          type: 'render-idle',
          timestamp: currentMetadata.previousStopTime,
          duration: timestamp - currentMetadata.previousStopTime,
        });
      }

      currentMetadata.hasUncommittedWork = true;
      currentMetadata.previousStartTime = timestamp;
      currentMetadata.previousStopTime = null;
    } else if (name === '--render-stop') {
      if (currentMetadata.previousStartTime === null) {
        console.warn('Unexpected render stop');
      } else {
        currentProcessedGroup.reactWork.push({
          type: 'render-work',
          timestamp: currentMetadata.previousStartTime,
          duration: timestamp - currentMetadata.previousStartTime,
        });
      }

      currentMetadata.previousStartTime = null;
      currentMetadata.previousStopTime = timestamp;
    } else if (name === '--render-yield') {
      if (currentMetadata.previousStartTime === null) {
        console.warn('Unexpected render stop');
      } else {
        currentProcessedGroup.reactWork.push({
          type: 'render-work',
          timestamp: currentMetadata.previousStartTime,
          duration: timestamp - currentMetadata.previousStartTime,
        });
      }

      currentMetadata.previousStartTime = null;
      currentMetadata.previousStopTime = timestamp;
    } else if (name === '--render-cancel') {
      if (currentMetadata.previousStartTime === null) {
        console.warn('Unexpected render stop');
      } else {
        currentProcessedGroup.reactWork.push({
          type: 'render-work',
          timestamp: currentMetadata.previousStartTime,
          duration: timestamp - currentMetadata.previousStartTime,
        });
      }

      currentMetadata.hasUncommittedWork = false;
      currentMetadata.previousStartTime = null;
      currentMetadata.previousStopTime = null;
    } else if (name === '--commit-start') {
      if (currentMetadata.previousStartTime !== null) {
        console.warn('Unexpected commit start');
      }

      if (
        currentMetadata.hasUncommittedWork &&
        currentMetadata.previousStopTime !== null &&
        currentMetadata.previousStopTime < timestamp
      ) {
        currentProcessedGroup.reactWork.push({
          type: 'render-idle',
          timestamp: currentMetadata.previousStopTime,
          duration: timestamp - currentMetadata.previousStopTime,
        });
      }

      currentMetadata.hasInProgressCommit = true;
      currentMetadata.previousStartTime = timestamp;
    } else if (name === '--commit-stop') {
      if (currentMetadata.previousStartTime === null) {
        console.warn('Unexpected commit stop');
      } else {
        currentProcessedGroup.reactWork.push({
          type: 'commit-work',
          timestamp: currentMetadata.previousStartTime,
          duration: timestamp - currentMetadata.previousStartTime,
        });
      }

      currentMetadata.hasInProgressCommit = false;
      currentMetadata.hasUncommittedWork = false;
      currentMetadata.previousStartTime = null;
      currentMetadata.previousStopTime = null;
    } else if (
      name === '--layout-effects-start' ||
      name === '--passive-effects-start'
    ) {
      if (currentMetadata.hasInProgressCommit) {
        currentProcessedGroup.reactWork.push({
          type: 'commit-work',
          timestamp: currentMetadata.previousStartTime,
          duration: timestamp - currentMetadata.previousStartTime,
        });
      } else if (
        currentMetadata.hasUncommittedWork &&
        currentMetadata.previousStopTime !== null
      ) {
        currentProcessedGroup.reactWork.push({
          type: 'render-idle',
          timestamp: currentMetadata.previousStopTime,
          duration: timestamp - currentMetadata.previousStopTime,
        });
      }

      currentMetadata.previousStartTime = timestamp;
    } else if (
      name === '--layout-effects-stop' ||
      name === '--passive-effects-stop'
    ) {
      currentProcessedGroup.reactWork.push({
        type:
          name === '--layout-effects-stop'
            ? 'layout-effects'
            : 'passive-effects',
        timestamp: currentMetadata.previousStartTime,
        duration: timestamp - currentMetadata.previousStartTime,
      });

      if (currentMetadata.hasInProgressCommit) {
        currentMetadata.previousStartTime = timestamp;
      } else {
        currentMetadata.previousStartTime = null;
      }
    } else if (name.startsWith('--schedule-render')) {
      currentProcessedGroup.reactEvents.push({
        type: 'schedule-render',
        priority: currentPriority, // TODO Change to target priority
        timestamp,
      });
    } else if (name.startsWith('--schedule-state-update-')) {
      const [componentName, componentStack] = name.substr(24).split('-');
      currentProcessedGroup.reactEvents.push({
        type: 'schedule-state-update',
        priority: currentPriority, // TODO Change to target priority
        timestamp,
        componentName,
        componentStack,
      });
    } else if (name.startsWith('--suspend-')) {
      const [componentName, componentStack] = name.substr(10).split('-');
      currentProcessedGroup.reactEvents.push({
        type: 'suspend',
        timestamp,
        componentName,
        componentStack,
      });
    }
  }

  return processedData;
}
