/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getMarkerFullDescription, getMarkerCategory } from './marker-data';
import { ListOfNumbersTree } from './list-tree';
import { formatSeconds } from '../utils/format-numbers';

import type { Milliseconds } from '../types/units';
import type { Marker, MarkerIndex } from '../types/profile-derived';

export type MarkerDisplayData = {|
  start: string,
  duration: string,
  name: string,
  category: string,
|};

class MarkerTree extends ListOfNumbersTree<MarkerDisplayData> {
  _getMarker: MarkerIndex => Marker;
  _zeroAt: Milliseconds;
  _displayDataByIndex: Map<MarkerIndex, MarkerDisplayData>;

  constructor(
    getMarker: MarkerIndex => Marker,
    markerIndexes: MarkerIndex[],
    zeroAt: Milliseconds
  ) {
    super(markerIndexes);
    this._getMarker = getMarker;
    this._zeroAt = zeroAt;
    this._displayDataByIndex = new Map();
  }

  _getDisplayData(markerIndex: MarkerIndex): MarkerDisplayData {
    const marker = this._getMarker(markerIndex);
    const name = getMarkerFullDescription(marker);
    const category = getMarkerCategory(marker);
    return {
      start: _formatStart(marker.start, this._zeroAt),
      duration: marker.incomplete ? 'unknown' : _formatDuration(marker.dur),
      name,
      category,
    };
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
  getMarker: MarkerIndex => Marker,
  markerIndexes: MarkerIndex[],
  zeroAt: Milliseconds
): MarkerTree {
  return new MarkerTree(getMarker, markerIndexes, zeroAt);
}
