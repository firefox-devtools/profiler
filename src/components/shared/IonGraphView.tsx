/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { LineTimings } from 'firefox-profiler/types';

import { GraphViewer } from 'iongraph-web';
import type { Func } from 'iongraph-web';
import 'iongraph-web/dist/style.css';

import { useMemo } from 'react';

type IonGraphViewProps = {
  readonly sourceCode: string;
  // TODO: use these when https://github.com/mozilla-spidermonkey/iongraph-web/issues/3 is resolved.
  readonly timings: LineTimings;
  readonly hotSpotTimings: LineTimings;
};

export function IonGraphView(props: IonGraphViewProps) {
  const func = useMemo(() => {
    if (props.sourceCode.trim() === '') {
      return null;
    }
    return JSON.parse(props.sourceCode) as Func;
  }, [props.sourceCode]);

  if (!func) {
    return <div />;
  }
  return <GraphViewer func={func} />;
}
