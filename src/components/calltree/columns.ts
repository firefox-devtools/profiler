/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Icon } from 'firefox-profiler/components/shared/Icon';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

import type {
  Column,
  MaybeResizableColumn,
} from 'firefox-profiler/components/shared/TreeView';
import type { CallNodeDisplayData, WeightType } from 'firefox-profiler/types';

export const nameColumn: Column<CallNodeDisplayData> = {
  propName: 'name',
  titleL10nId: '',
};

export const libColumn: Column<CallNodeDisplayData> = {
  propName: 'lib',
  titleL10nId: '',
};

export const treeColumnsForTracingMs: MaybeResizableColumn<CallNodeDisplayData>[] =
  [
    {
      propName: 'totalPercent',
      titleL10nId: '',
      initialWidth: 55,
      hideDividerAfter: true,
    },
    {
      propName: 'total',
      titleL10nId: 'CallTree--tracing-ms-total',
      minWidth: 30,
      initialWidth: 70,
      resizable: true,
      headerWidthAdjustment: 55 /* totalPercent initialWidth */,
    },
    {
      propName: 'self',
      titleL10nId: 'CallTree--tracing-ms-self',
      minWidth: 40,
      initialWidth: 80,
      resizable: true,
    },
    {
      propName: 'icon',
      titleL10nId: '',
      component: Icon as any,
      initialWidth: 20,
    },
  ];

export const treeColumnsForSamples: MaybeResizableColumn<CallNodeDisplayData>[] =
  [
    {
      propName: 'totalPercent',
      titleL10nId: '',
      initialWidth: 55,
      hideDividerAfter: true,
    },
    {
      propName: 'total',
      titleL10nId: 'CallTree--samples-total',
      minWidth: 30,
      initialWidth: 70,
      resizable: true,
      headerWidthAdjustment: 55 /* totalPercent initialWidth */,
    },
    {
      propName: 'self',
      titleL10nId: 'CallTree--samples-self',
      minWidth: 40,
      initialWidth: 80,
      resizable: true,
    },
    {
      propName: 'icon',
      titleL10nId: '',
      component: Icon as any,
      initialWidth: 20,
    },
  ];

export const treeColumnsForBytes: MaybeResizableColumn<CallNodeDisplayData>[] =
  [
    {
      propName: 'totalPercent',
      titleL10nId: '',
      initialWidth: 55,
      hideDividerAfter: true,
    },
    {
      propName: 'total',
      titleL10nId: 'CallTree--bytes-total',
      minWidth: 30,
      initialWidth: 140,
      resizable: true,
      headerWidthAdjustment: 55 /* totalPercent initialWidth */,
    },
    {
      propName: 'self',
      titleL10nId: 'CallTree--bytes-self',
      minWidth: 40,
      initialWidth: 100,
      resizable: true,
    },
    {
      propName: 'icon',
      titleL10nId: '',
      component: Icon as any,
      initialWidth: 20,
    },
  ];

export function treeColumnsForWeightType(
  weightType: WeightType
): MaybeResizableColumn<CallNodeDisplayData>[] {
  switch (weightType) {
    case 'tracing-ms':
      return treeColumnsForTracingMs;
    case 'samples':
      return treeColumnsForSamples;
    case 'bytes':
      return treeColumnsForBytes;
    default:
      throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
  }
}
