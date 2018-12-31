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

import type { Thread } from '../../types/profile';
import type { CauseBacktrace } from '../../types/markers';
import type { ImplementationFilter } from '../../types/actions';

require('./Backtrace.css');

type Props = {|
  +thread: Thread,
  +cause: CauseBacktrace,
  +implementationFilter: ImplementationFilter,
|};

function Backtrace(props: Props) {
  const { cause, thread, implementationFilter } = props;
  const callNodePath = filterCallNodePathByImplementation(
    thread,
    implementationFilter,
    convertStackToCallNodePath(thread, cause.stack)
  );
  const funcNamesAndOrigins = getFuncNamesAndOriginsForPath(
    callNodePath,
    thread
  );

  return (
    <ol className="backtrace">
      {funcNamesAndOrigins.length > 0 ? (
        funcNamesAndOrigins.map(({ funcName, origin }, i) => (
          <li key={i} className="backtraceStackFrame">
            {funcName}
            <em className="backtraceStackFrameOrigin">{origin}</em>
          </li>
        ))
      ) : (
        <li className="backtraceStackFrame">
          (stack empty or all stack frames filtered out)
        </li>
      )}
    </ol>
  );
}

export default Backtrace;
