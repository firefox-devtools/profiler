/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import classNames from 'classnames';
import { getBacktraceItemsForStack } from 'firefox-profiler/profile-logic/transforms';

import type {
  CategoryList,
  Thread,
  IndexIntoStackTable,
  ImplementationFilter,
} from 'firefox-profiler/types';

import './Backtrace.css';

type Props = {
  readonly thread: Thread;
  // Tooltips will want to only show a certain number of stacks, while the sidebars
  // can show all of the stacks.
  readonly maxStacks: number;
  readonly stackIndex: IndexIntoStackTable;
  readonly implementationFilter: ImplementationFilter;
  readonly categories: CategoryList;
  readonly onStackFrameClick?: (stackIndex: IndexIntoStackTable) => void;
};

export function Backtrace(props: Props) {
  const {
    stackIndex,
    thread,
    implementationFilter,
    maxStacks,
    categories,
    onStackFrameClick,
  } = props;
  const funcNamesAndOrigins = getBacktraceItemsForStack(
    stackIndex,
    implementationFilter,
    thread
  );

  // Build a mapping from filtered frame index to stack index
  const { stackTable } = thread;
  const stackIndices: IndexIntoStackTable[] = [];
  for (
    let currentStackIndex: IndexIntoStackTable | null = stackIndex;
    currentStackIndex !== null;
    currentStackIndex = stackTable.prefix[currentStackIndex]
  ) {
    stackIndices.push(currentStackIndex);
  }

  // Create event handlers for each stack frame to avoid arrow functions in JSX
  const stackFrameHandlers = onStackFrameClick
    ? stackIndices.map((stackIdx) => () => onStackFrameClick(stackIdx))
    : [];

  if (funcNamesAndOrigins.length) {
    return (
      <ul className="backtrace">
        {funcNamesAndOrigins
          // Truncate the stacks
          .slice(0, maxStacks)
          .map(
            ({ funcName, origin, isFrameLabel, category, inlineDepth }, i) => {
              return (
                <li
                  key={i}
                  className={classNames('backtraceStackFrame', {
                    backtraceStackFrame_isFrameLabel: isFrameLabel,
                    backtraceStackFrame_clickable:
                      onStackFrameClick !== undefined,
                  })}
                  onDoubleClick={
                    onStackFrameClick ? stackFrameHandlers[i] : undefined
                  }
                >
                  <span
                    className={`colored-border category-color-${categories[category].color}`}
                    title={categories[category].name}
                  />
                  {inlineDepth > 0 ? (
                    <span className="backtraceInlineBadge" title="inlined">
                      (inlined)
                    </span>
                  ) : null}
                  {funcName}
                  <em className="backtraceStackFrameOrigin">{origin}</em>
                </li>
              );
            }
          )}
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
