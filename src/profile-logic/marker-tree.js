/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { formatSeconds } from '../utils/format-numbers';

import type { Milliseconds } from '../types/units';
import type {
  TracingMarker,
  IndexIntoTracingMarkers,
} from '../types/profile-derived';

export type MarkerDisplayData = {|
  start: string,
  duration: string,
  name: string,
  category: string,
|};

class MarkerTree {
  _markers: TracingMarker[];
  _zeroAt: Milliseconds;
  _displayDataByIndex: Map<IndexIntoTracingMarkers, MarkerDisplayData>;

  constructor(markers: TracingMarker[], zeroAt: Milliseconds) {
    this._markers = markers;
    this._zeroAt = zeroAt;
    this._displayDataByIndex = new Map();
  }

  getRoots(): IndexIntoTracingMarkers[] {
    const markerIndices = [];
    for (let i = 0; i < this._markers.length; i++) {
      markerIndices.push(i);
    }
    return markerIndices;
  }

  getChildren(markerIndex: IndexIntoTracingMarkers): IndexIntoTracingMarkers[] {
    return markerIndex === -1 ? this.getRoots() : [];
  }

  hasChildren(_markerIndex: IndexIntoTracingMarkers): boolean {
    return false;
  }

  getAllDescendants(): Set<IndexIntoTracingMarkers> {
    return new Set();
  }

  getParent(): IndexIntoTracingMarkers {
    // -1 isn't used, but needs to be compatible with the call tree.
    return -1;
  }

  getDepth() {
    return 0;
  }

  hasSameNodeIds(tree: MarkerTree) {
    return this._markers === tree._markers;
  }

  getDisplayData(markerIndex: IndexIntoTracingMarkers): MarkerDisplayData {
    let displayData = this._displayDataByIndex.get(markerIndex);
    if (displayData === undefined) {
      const marker = this._markers[markerIndex];
      let category = 'unknown';
      let name = marker.name;
      if (marker.data) {
        const data = marker.data;

        if (typeof data.category === 'string') {
          category = data.category;
        }

        switch (data.type) {
          case 'tracing':
            if (category === 'log') {
              // name is actually the whole message that was sent to fprintf_stderr. Would you consider that.
              if (name.length > 100) {
                name = name.substring(0, 100) + '...';
              }
            } else if (data.category === 'DOMEvent') {
              name = data.eventType;
            }
            break;

          case 'UserTiming':
            category = name;
            name = data.name;
            break;
          case 'Bailout':
            category = 'Bailout';
            break;
          case 'Network':
            category = 'Network';
            break;
          default:
        }
      }

      displayData = {
        start: _formatStart(marker.start, this._zeroAt),
        duration: _formatDuration(marker.dur),
        name,
        category,
      };
      this._displayDataByIndex.set(markerIndex, displayData);
    }
    return displayData;
  }
}

function _formatStart(start: number, zeroAt) {
  return formatSeconds(start - zeroAt);
}

function _formatDuration(duration: number): string {
  if (duration === 0) {
    return '—';
  }
  let maximumFractionDigits = 1;
  if (duration < 0.01) {
    maximumFractionDigits = 3;
  } else if (duration < 1) {
    maximumFractionDigits = 2;
  }
  return (
    duration.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }) + 'ms'
  );
}

export function getMarkerTree(
  markers: TracingMarker[],
  zeroAt: Milliseconds
): MarkerTree {
  return new MarkerTree(markers, zeroAt);
}
