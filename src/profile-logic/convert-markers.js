/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  GCMajorMarkerPayload,
  GCMajorMarkerPayload_Gecko,
  GCMajorCompleted,
} from '../types/markers';

export function upgradeGCMinorMarker(marker: Object) {
  if ('nursery' in marker) {
    if ('status' in marker.nursery) {
      if (marker.nursery.status === 'no collection') {
        marker.nursery.status = 'nursery empty';
      }
    } else {
      /*
       * This is the old format for GCMinor, rename some
       * properties to the more sensible names in the newer
       * format and set the status.
       *
       * Note that we don't delete certain properties such as
       * promotion_rate, leave them so that anyone opening the
       * raw json data can still see them in converted profiles.
       */
      marker.nursery.status = 'complete';

      marker.nursery.bytes_used = marker.nursery.nursery_bytes;
      delete marker.nursery.nursery_bytes;

      // cur_capacity cannot be filled in.
      marker.nursery.new_capacity = marker.nursery.new_nursery_bytes;
      delete marker.nursery.new_nursery_bytes;

      marker.nursery.phase_times = marker.nursery.timings;
      delete marker.nursery.timings;
    }
  }
}

/*
 * Fix the units for GCMajor and GCSlice phase times.
 */
export function convertPhaseTimes(old_phases: Object): Object {
  const phases = {};
  for (const phase in old_phases) {
    phases[phase] = old_phases[phase] * 1000;
  }
  return phases;
}

/*
 * Upgrade a GCMajor marker in the Gecko profile format.
 */
export function upgradeGCMajorMarker_Gecko8To9(
  marker: Object
): GCMajorMarkerPayload_Gecko {
  if ('timings' in marker) {
    if (!('status' in marker.timings)) {
      /*
       * This is the old version of the GCMajor marker.
       */

      const timings = marker.timings;

      timings.status = 'completed';

      /*
       * The old version had a bug where the slices field could be included
       * twice with different meanings.  So we attempt to read it as either
       * the number of slices or a list of slices.
       */
      if (Array.isArray(timings.sices)) {
        timings.slices_list = timings.slices;
        timings.slices = timings.slices.length;
      }

      timings.allocated_bytes = timings.allocated * 1024 * 1024;
    }
  }

  return marker;
}

export function upgradeGCMajorMarker_Processed8to9(
  marker8: Object
): GCMajorMarkerPayload {
  // The Processed 8-to-9 upgrade is a superset of the gecko 8-to-9 upgrade.
  const marker9 = upgradeGCMajorMarker_Gecko8To9(marker8);
  const mt = marker9.timings;
  switch (mt.status) {
    case 'completed': {
      const timings: GCMajorCompleted = Object.assign({}, mt, {
        phase_times: convertPhaseTimes(mt.totals),
        mmu_20ms: mt.mmu_20ms / 100,
        mmu_50ms: mt.mmu_50ms / 100,
      });
      return {
        type: 'GCMajor',
        startTime: marker9.startTime,
        endTime: marker9.endTime,
        timings: timings,
      };
    }
    case 'aborted': {
      return {
        type: 'GCMajor',
        startTime: marker9.startTime,
        endTime: marker9.endTime,
        timings: { status: 'aborted' },
      };
    }
    default:
      console.log('Unknown GCMajor status');
      throw new Error('Unknown GCMajor status');
  }
}
