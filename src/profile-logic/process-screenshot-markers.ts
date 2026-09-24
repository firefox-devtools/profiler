/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { oneLine } from 'common-tags';
import type { MarkerSchema } from 'firefox-profiler/types';

export const compositorScreenshotMarkerSchema: MarkerSchema = {
  name: 'CompositorScreenshot',
  display: ['marker-chart', 'marker-table'],
  fields: [
    {
      key: 'url',
      label: 'Image',
      format: {
        type: 'screenshot-data-url',
        sizeFieldForAspectRatio: 'windowSize',
      },
    },
    { key: 'windowSize', label: 'Window Size', format: 'screenshot-size' },
    { key: 'windowID', label: 'Window ID', format: 'string' },
  ],
  description: oneLine`
    This marker spans the time between each composite of a window and shows
    the window contents during that time.
  `,
};
