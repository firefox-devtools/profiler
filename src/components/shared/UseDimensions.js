/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import type { CssPixels } from 'firefox-profiler/types';

type Dimensions = $ReadOnly<{|
  width: CssPixels,
  height: CssPixels,
|}>;

/**
 * A React hook to get the dimensions of a DOM node.
 */
export function useDimensions() {
  const [dimensions, setDimensions] = React.useState<Dimensions>({
    width: 0,
    height: 0,
  });
  const ref = React.useRef<null | HTMLElement>(null);
  const [rafId, setRafId] = React.useState<AnimationFrameID | null>(null);

  function measureImmediately() {
    const node = ref.current;
    // Text nodes and the initial node do not have a getBoundingClientRect.
    if (node) {
      const { width, height } = node.getBoundingClientRect();
      if (dimensions.width !== width || dimensions.height !== height) {
        setDimensions({ width, height });
      }
    }
  }

  function scheduleMeasure() {
    if (rafId !== null) {
      // a rafHas already been requested, only schedule one at a time.
      return;
    }
    setRafId(
      requestAnimationFrame(() => {
        setRafId(null);
        measureImmediately();
      })
    );
  }

  React.useEffect(
    () => {
      scheduleMeasure();
      window.addEventListener('resize', scheduleMeasure);
      window.addEventListener('visibilitychange', scheduleMeasure);
      return () => {
        window.removeEventListener('resize', scheduleMeasure);
        window.removeEventListener('visibilitychange', scheduleMeasure);
      };
    },
    // Only run this effect once:
    []
  );

  return { ref, dimensions };
}
