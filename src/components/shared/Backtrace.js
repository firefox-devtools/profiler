/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { filterCallNodePathByImplementation } from '../../profile-logic/transforms';
import { getOriginAnnotationForFunc } from '../../profile-logic/profile-data';

import type { Thread, IndexIntoStackTable } from '../../types/profile';
import type { CallNodePath } from '../../types/profile-derived';
import type { CauseBacktrace } from '../../types/markers';
import type { ImplementationFilter } from '../../types/actions';

require('./Backtrace.css');

type Props = {|
  +thread: Thread,
  +cause: CauseBacktrace,
  +implementationFilter: ImplementationFilter,
|};

function callNodePathForStack(
  thread: Thread,
  stack: IndexIntoStackTable
): CallNodePath {
  const { stackTable, frameTable } = thread;
  const path = [];
  for (
    let stackIndex = stack;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    path.push(frameTable.func[stackTable.frame[stackIndex]]);
  }
  return path;
}

function Backtrace(props: Props) {
  const { cause, thread, implementationFilter } = props;
  const { funcTable, stringTable } = thread;
  const callNodePath = filterCallNodePathByImplementation(
    thread,
    implementationFilter,
    callNodePathForStack(thread, cause.stack)
  );

  return (
    <ol className="backtrace">
      {callNodePath.length > 0
        ? callNodePath.map((func, i) => {
            return (
              <li key={i} className="backtraceStackFrame">
                {stringTable.getString(funcTable.name[func])}
                <em className="backtraceStackFrameOrigin">
                  {getOriginAnnotationForFunc(
                    func,
                    thread.funcTable,
                    thread.resourceTable,
                    thread.stringTable
                  )}
                </em>
              </li>
            );
          })
        : <li className="backtraceStackFrame">
            (stack empty or all stack frames filtered out)
          </li>}
    </ol>
  );
}

export default Backtrace;
