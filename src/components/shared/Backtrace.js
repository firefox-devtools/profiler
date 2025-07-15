/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import classNames from 'classnames';
import { getBacktraceItemsForStack } from 'firefox-profiler/profile-logic/transforms';

import type {
  CategoryList,
  Thread,
  IndexIntoStackTable,
  ImplementationFilter,
} from 'firefox-profiler/types';

import './Backtrace.css';

type Props = {|
  +thread: Thread,
  // Tooltips will want to only show a certain number of stacks, while the sidebars
  // can show all of the stacks.
  +maxStacks: number,
  +stackIndex: IndexIntoStackTable,
  +implementationFilter: ImplementationFilter,
  +categories: CategoryList,
|};

export function Backtrace(props: Props) {
  const { stackIndex, thread, implementationFilter, maxStacks, categories } =
    props;
  const funcNamesAndOrigins = getBacktraceItemsForStack(
    stackIndex,
    implementationFilter,
    thread
  );

  if (funcNamesAndOrigins.length) {
    return (
      <ul className="backtrace">
        {funcNamesAndOrigins
          // Truncate the stacks
          .slice(0, maxStacks)
          .map(({ funcName, origin, isFrameLabel, category }, i) => (
            <li
              key={i}
              className={classNames('backtraceStackFrame', {
                backtraceStackFrame_isFrameLabel: isFrameLabel,
              })}
            >
              <span
                className={`colored-border category-color-${categories[category].color}`}
                title={categories[category].name}
              />
              {funcName}
              <em className="backtraceStackFrameOrigin">{origin}</em>
            </li>
          ))}
        {funcNamesAndOrigins.length > maxStacks
          ? [
              <span
                key={funcNamesAndOrigins.length}
                className="colored-border ellipsis"
              />,
              '…',
            ]
          : null}
      </ul>
    );
  }
  return (
    <div className="backtrace">
      (The stack is empty because all of its frames are filtered out by the
      implementation filter. Switch the implementation filter in the call tree
      to see more frames.)
    </div>
  );
}
