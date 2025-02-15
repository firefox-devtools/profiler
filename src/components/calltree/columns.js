/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { Icon } from 'firefox-profiler/components/shared/Icon';

import type { MaybeResizableColumn } from 'firefox-profiler/components/shared/TreeView';
import type { CallNodeDisplayData } from 'firefox-profiler/types';

export const treeColumnsForTracingMs: MaybeResizableColumn<CallNodeDisplayData>[] =
  [
    {
      propName: 'totalPercent',
      titleL10nId: '',
      initialWidth: 50,
      hideDividerAfter: true,
    },
    {
      propName: 'total',
      titleL10nId: 'CallTree--tracing-ms-total',
      minWidth: 30,
      initialWidth: 70,
      resizable: true,
      headerWidthAdjustment: 50,
    },
    {
      propName: 'self',
      titleL10nId: 'CallTree--tracing-ms-self',
      minWidth: 30,
      initialWidth: 70,
      resizable: true,
    },
    {
      propName: 'icon',
      titleL10nId: '',
      component: Icon,
      initialWidth: 10,
    },
  ];

export const treeColumnsForSamples = [
  {
    propName: 'totalPercent',
    titleL10nId: '',
    initialWidth: 50,
    hideDividerAfter: true,
  },
  {
    propName: 'total',
    titleL10nId: 'CallTree--samples-total',
    minWidth: 30,
    initialWidth: 70,
    resizable: true,
    headerWidthAdjustment: 50,
  },
  {
    propName: 'self',
    titleL10nId: 'CallTree--samples-self',
    minWidth: 30,
    initialWidth: 70,
    resizable: true,
  },
  {
    propName: 'icon',
    titleL10nId: '',
    component: Icon,
    initialWidth: 10,
  },
];
export const treeColumnsForBytes: MaybeResizableColumn<CallNodeDisplayData>[] =
  [
    {
      propName: 'totalPercent',
      titleL10nId: '',
      initialWidth: 50,
      hideDividerAfter: true,
    },
    {
      propName: 'total',
      titleL10nId: 'CallTree--bytes-total',
      minWidth: 30,
      initialWidth: 140,
      resizable: true,
      headerWidthAdjustment: 50,
    },
    {
      propName: 'self',
      titleL10nId: 'CallTree--bytes-self',
      minWidth: 30,
      initialWidth: 90,
      resizable: true,
    },
    {
      propName: 'icon',
      titleL10nId: '',
      component: Icon,
      initialWidth: 10,
    },
  ];
