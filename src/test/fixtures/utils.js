/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { CallTree } from '../../profile-logic/call-tree';
import type { IndexIntoCallNodeTable } from '../../types/profile-derived';
import type { Store, State } from '../../types/store';

export function getBoundingBox(width: number, height: number) {
  return {
    width,
    height,
    left: 0,
    x: 0,
    top: 0,
    y: 0,
    right: width,
    bottom: height,
  };
}

export function getMouseEvent(values: Object = {}): $Shape<MouseEvent> {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    metaKey: false,
    movementX: 0,
    movementY: 0,
    nativeEvent: {
      offsetX: 0,
      offsetY: 0,
    },
    pageX: 0,
    pageY: 0,
    screenX: 0,
    screenY: 0,
    shiftKey: false,
    ...values,
  };
}

/**
 * This function formats a call tree into a human readable form, to make it easy
 * to assert certain relationships about the data structure in a really terse
 * and human-friendly fashion. For instance a call tree could become formatted
 * like so:
 *
 * [
 *   '- A (total: 4, self: —)',
 *   '  - B (total: 3, self: —)',
 *   '    - C (total: 1, self: 1)',
 *   '    - D (total: 1, self: 1)',
 *   '    - E (total: 1, self: 1)',
 *   '  - F (total: 1, self: 1)',
 * ]
 *
 * This structure is easy to read, avoids whitespace issues, and diffs really well
 * on the test output, showing where errors occur. Previously snapshots were used,
 * but the assertion was hidden in another file, which really hurt discoverability
 * and maintainability.
 */
export function formatTree(
  callTree: CallTree,
  includeCategories: boolean = false,
  children: IndexIntoCallNodeTable[] = callTree.getRoots(),
  depth: number = 0,
  lines: string[] = []
): string[] {
  const whitespace = Array(depth * 2 + 1).join(' ');

  children.forEach(callNodeIndex => {
    const { name, totalTime, selfTime, categoryName } = callTree.getDisplayData(
      callNodeIndex
    );
    const displayName = includeCategories ? `${name} [${categoryName}]` : name;
    lines.push(
      `${whitespace}- ${displayName} (total: ${totalTime}, self: ${selfTime})`
    );
    formatTree(
      callTree,
      includeCategories,
      callTree.getChildren(callNodeIndex),
      depth + 1,
      lines
    );
  });

  return lines;
}

/**
 * Convenience wrapper around formatTree, with includeCategories == true.
 * This produces output like the following:
 *
 * [
 *   '- A [Other] (total: 4, self: —)',
 *   '  - B [Graphics] (total: 3, self: —)',
 *   '    - C [Graphics] (total: 1, self: 1)',
 *   '    - D [Graphics] (total: 1, self: 1)',
 *   '    - E [DOM] (total: 1, self: 1)',
 *   '  - F [Other] (total: 1, self: 1)',
 * ]
 */
export function formatTreeIncludeCategories(callTree: CallTree): string[] {
  return formatTree(callTree, true);
}

/**
 * Wait until the Redux store gets into a specific state given a predicate function.
 * Generally prefer hooking into existing promises, but this can be used in cases,
 * like when clicking a component link in a test, where there is no Promise to
 * wait on.
 */
export function waitUntilState(
  store: Store,
  predicate: State => boolean
): Promise<void> {
  return new Promise(resolve => {
    store.subscribe(() => {
      if (predicate(store.getState())) {
        // Resolve the next Promise tick, and allow all other store subscribers
        // to update first.
        Promise.resolve().then(resolve);
      }
    });
  });
}
