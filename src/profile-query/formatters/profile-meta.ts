/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfile } from 'firefox-profiler/selectors/profile';
import {
  formatProductAndVersion,
  formatPlatform,
} from 'firefox-profiler/profile-logic/profile-metainfo';
import { formatFromMarkerSchema } from 'firefox-profiler/profile-logic/marker-schema';
import { StringTable } from 'firefox-profiler/utils/string-table';
import type { Store } from '../../types/store';
import type { ProfileMetaResult } from '../types';

/**
 * Collect the profile's `meta` field into a structured, grouped result. This
 * mirrors what the "Profile Info" panel renders in the web UI, reusing the same
 * formatting helpers so the CLI and the UI stay consistent.
 */
export function collectProfileMeta(store: Store): ProfileMetaResult {
  const { meta } = getProfile(store.getState());

  const result: ProfileMetaResult = {
    type: 'profile-meta',
    interval: meta.interval,
    product: meta.product,
  };

  // ===== Recording =====
  // When profilingStartTime is present, startTime + profilingStartTime is the
  // moment recording actually began. Otherwise fall back to the raw startTime.
  const startTime =
    meta.profilingStartTime !== undefined
      ? meta.startTime + meta.profilingStartTime
      : meta.startTime;
  if (startTime !== undefined) {
    result.startTime = startTime;
    result.startTimeFormatted = new Date(startTime).toISOString();
  }

  let durationMs;
  if (
    meta.profilingStartTime !== undefined &&
    meta.profilingEndTime !== undefined
  ) {
    durationMs = meta.profilingEndTime - meta.profilingStartTime;
  } else if (meta.endTime !== undefined) {
    durationMs = meta.endTime - (meta.profilingStartTime ?? 0);
  }
  if (durationMs !== undefined) {
    result.durationMs = durationMs;
  }

  if (meta.endTime !== undefined) {
    result.endTime = meta.endTime;
    result.endTimeFormatted = new Date(meta.endTime).toISOString();
  }

  if (meta.symbolicated !== undefined) {
    result.symbolicated = meta.symbolicated;
  }

  const { configuration } = meta;
  if (configuration) {
    // Capacity is stored in entries of 8 bytes each.
    result.bufferCapacityBytes = configuration.capacity * 8;
    if (configuration.duration !== undefined) {
      result.bufferDuration = configuration.duration;
    }
    if (configuration.features.length) {
      result.features = configuration.features;
    }
    if (configuration.threads.length) {
      result.threadsFilter = configuration.threads;
    }
  }

  // ===== Application =====
  const productAndVersion = formatProductAndVersion(meta);
  if (productAndVersion) {
    result.productAndVersion = productAndVersion;
  }
  if (meta.profilingStartTime !== undefined) {
    result.uptimeMs = meta.profilingStartTime;
  }
  if (meta.appBuildID !== undefined) {
    result.appBuildID = meta.appBuildID;
  }
  if (meta.sourceURL !== undefined) {
    result.sourceURL = meta.sourceURL;
  }
  if (meta.updateChannel !== undefined) {
    result.updateChannel = meta.updateChannel;
  }
  if (meta.debug !== undefined) {
    result.debug = meta.debug;
  }
  if (meta.arguments !== undefined) {
    result.arguments = meta.arguments;
  }
  if (meta.extensions && meta.extensions.length) {
    const { extensions } = meta;
    const list = [];
    for (let i = 0; i < extensions.length; i++) {
      const entry: { name: string; id: string; baseURL?: string } = {
        name: extensions.name[i],
        id: extensions.id[i],
      };
      if (extensions.baseURL[i] !== undefined) {
        entry.baseURL = extensions.baseURL[i];
      }
      list.push(entry);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    result.extensions = list;
  }

  // ===== Platform =====
  const platform = formatPlatform(meta);
  if (platform) {
    result.platform = platform;
  }
  if (meta.oscpu !== undefined) {
    result.oscpu = meta.oscpu;
  }
  if (meta.abi !== undefined) {
    result.abi = meta.abi;
  }
  if (meta.device !== undefined) {
    result.device = meta.device;
  }
  if (meta.CPUName !== undefined) {
    result.cpuName = meta.CPUName;
  }
  if (meta.physicalCPUs !== undefined) {
    result.physicalCPUs = meta.physicalCPUs;
  }
  if (meta.logicalCPUs !== undefined) {
    result.logicalCPUs = meta.logicalCPUs;
  }
  if (meta.mainMemory !== undefined) {
    result.mainMemoryBytes = meta.mainMemory;
  }

  // ===== Import / misc =====
  if (meta.importedFrom !== undefined) {
    result.importedFrom = meta.importedFrom;
  }
  if (meta.fileName !== undefined) {
    result.fileName = meta.fileName;
  }
  if (meta.fileSize !== undefined) {
    result.fileSize = meta.fileSize;
  }
  if (meta.version !== undefined) {
    result.version = meta.version;
  }
  if (meta.preprocessedProfileVersion !== undefined) {
    result.preprocessedProfileVersion = meta.preprocessedProfileVersion;
  }
  if (meta.sampleUnits !== undefined) {
    result.sampleUnits = meta.sampleUnits;
  }

  // ===== Extra =====
  if (meta.extra && meta.extra.length) {
    const stringTable = StringTable.withBackingArray([]);
    result.extra = meta.extra.map((section) => ({
      label: section.label,
      entries: section.entries.map((entry) => ({
        label: entry.label,
        value: entry.value,
        formatted: formatFromMarkerSchema(
          'moreInfo',
          entry.format,
          entry.value,
          stringTable
        ),
      })),
    }));
  }

  return result;
}
