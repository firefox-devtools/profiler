/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { CallTree } from '../../profile-logic/call-tree';
import type {
  IndexIntoCallNodeTable,
  Store,
  State,
} from 'firefox-profiler/types';

import { ensureExists } from '../../utils/flow';
import { fireEvent, type RenderResult } from 'react-testing-library';

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

/**
 * jsdom's MouseEvent object is incomplete (see
 * https://github.com/jsdom/jsdom/issues/1911) and we use some of the
 * missing properties in our app code. This fake MouseEvent allows the test code
 * to supply these properties.
 */

type FakeMouseEventInit = $Shape<{
  bubbles: boolean,
  cancelable: boolean,
  composed: boolean,
  altKey: boolean,
  button: 0 | 1 | 2 | 3 | 4,
  buttons: number,
  clientX: number,
  clientY: number,
  ctrlKey: boolean,
  metaKey: boolean,
  movementX: number,
  movementY: number,
  offsetX: number,
  offsetY: number,
  pageX: number,
  pageY: number,
  screenX: number,
  screenY: number,
  shiftKey: boolean,
  x: number,
  y: number,
}>;

class FakeMouseEvent extends MouseEvent {
  offsetX: number;
  offsetY: number;
  pageX: number;
  pageY: number;
  x: number;
  y: number;

  constructor(type: string, values: FakeMouseEventInit) {
    const { pageX, pageY, offsetX, offsetY, x, y, ...mouseValues } = values;
    super(type, (mouseValues: Object));

    Object.assign(this, {
      offsetX: offsetX || 0,
      offsetY: offsetY || 0,
      pageX: pageX || 0,
      pageY: pageY || 0,
      x: x || 0,
      y: y || 0,
    });
  }
}

/**
 * Use this function to retrieve a fake MouseEvent instance. This is really only
 * necessary when we need to use some of the properties unsupported by jsdom,
 * like `clientX` and `clientY` or `pageX` and `pageY`.
 * This is to be used directly by `fireEvent`, not `fireEvent.mouseXXX`, eg:
 *
 *   fireEvent(target, getMouseEvent('mousemove', { pageX: 5 });
 *
 * For other cases it's not necessary to use `getMouseEvent`, eg:
 *
 *   fireEvent.mouseDown(target, { clientX: 5 });
 *
 */
export function getMouseEvent(
  type: string,
  values: FakeMouseEventInit = {}
): FakeMouseEvent {
  values = {
    bubbles: true,
    cancelable: true,
    ...values,
  };
  return new FakeMouseEvent(type, values);
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
    const { name, total, self, categoryName } = callTree.getDisplayData(
      callNodeIndex
    );
    const displayName = includeCategories ? `${name} [${categoryName}]` : name;
    lines.push(
      `${whitespace}- ${displayName} (total: ${total}, self: ${self})`
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
  if (predicate(store.getState())) {
    return Promise.resolve();
  }

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

/**
 * Tests with components using React portals (tooltips for instance)
 * need to have a mountpoint in the DOM.
 */
export function addRootOverlayElement() {
  const div = document.createElement('div');
  div.id = 'root-overlay';
  ensureExists(
    document.body,
    'Expected the document.body to exist.'
  ).appendChild(div);
}

export function removeRootOverlayElement() {
  ensureExists(
    document.body,
    'Expected the document.body to exist.'
  ).removeChild(
    ensureExists(
      document.querySelector('#root-overlay'),
      'Expected to find a root overlay element to clean up.'
    )
  );
}

/**
 * You can't change <select>s by just clicking them using react-testing-library. This
 * utility makes it so that selects can be changed by the text that is in them.
 *
 * Usage:
 * changeSelect({ from: 'Timing Data', to: 'Deallocations' });
 */
export function createSelectChanger(renderResult: RenderResult) {
  return function changeSelect({ from, to }: {| from: string, to: string |}) {
    // Look up the <option> with the text label.
    const option = renderResult.getByText(to);
    // Fire a change event to the select.
    fireEvent.change(renderResult.getByDisplayValue(from), {
      target: { value: option.getAttribute('value') },
    });
  };
}

/**
 * Find a single x/y position for a ctx.fillText call.
 */
export function findFillTextPositionFromDrawLog(
  drawLog: any[],
  fillText: string
): {| x: number, y: number |} {
  const positions = drawLog
    .filter(([cmd, text]) => cmd === 'fillText' && text === fillText)
    .map(([, , x, y]) => ({ x, y }));

  if (positions.length === 0) {
    throw new Error('Could not find a fillText command for ' + fillText);
  }

  if (positions.length > 1) {
    throw new Error('More than one fillText() call was found for ' + fillText);
  }

  return positions[0];
}
