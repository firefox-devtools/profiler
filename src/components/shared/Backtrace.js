/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { filterCallNodePathByImplementation } from '../../profile-logic/transforms';
import {
  getFuncNamesAndOriginsForPath,
  convertStackToCallNodePath,
} from '../../profile-logic/profile-data';

import type { Thread, IndexIntoStackTable } from '../../types/profile';
import type { ImplementationFilter } from '../../types/actions';

require('./Backtrace.css');

type Props = {|
  +thread: Thread,
  +maxHeight: string | number,
  +stackIndex: IndexIntoStackTable,
  +implementationFilter: ImplementationFilter,
|};

function Backtrace(props: Props) {
  const { stackIndex, thread, implementationFilter, maxHeight } = props;
  const callNodePath = filterCallNodePathByImplementation(
    thread,
    implementationFilter,
    convertStackToCallNodePath(thread, stackIndex)
  );
  const funcNamesAndOrigins = getFuncNamesAndOriginsForPath(
    callNodePath,
    thread
  ).reverse();

  if (funcNamesAndOrigins.length) {
    return (
      <ol className="backtrace" style={{ '--max-height': maxHeight }}>
        {funcNamesAndOrigins.map(({ funcName, origin }, i) => (
          <li key={i} className="backtraceStackFrame">
            {funcName}
            <em className="backtraceStackFrameOrigin">{origin}</em>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="backtrace">
      (The stack is empty because all its frames are filtered out by the
      implementation filter. You can switch the implementation filter in the
      call tree to see more frames.)
    </div>
  );
}

export default Backtrace;
