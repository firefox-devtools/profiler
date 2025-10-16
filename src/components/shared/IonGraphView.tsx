/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { LineTimings } from 'firefox-profiler/types';

import { GraphViewer, migrate } from 'iongraph-web/react';
import 'iongraph-web/style.css';

import { useMemo } from 'react';

type IonGraphViewProps = {
  readonly sourceCode: string;
  readonly timings: LineTimings;
  readonly hotSpotTimings: LineTimings;
};

export function IonGraphView(props: IonGraphViewProps) {
  const ionJSON = useMemo(() => {
    if (props.sourceCode.trim() === '') {
      return null;
    }
    return migrate(JSON.parse(props.sourceCode));
  }, [props.sourceCode]);

  if (!ionJSON?.functions[0]) {
    return <div />;
  }
  return (
    <GraphViewer func={ionJSON.functions[0]} sampleCounts={props.timings} />
  );
}
