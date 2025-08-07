/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getCallTree,
  computeCallNodeSelfAndSummary,
  computeCallTreeTimings,
  computeFunctionListTimings,
  type CallTree,
} from 'firefox-profiler/profile-logic/call-tree';
import { getEmptyThread } from 'firefox-profiler/profile-logic/data-structures';
import {
  computeCallNodeFuncIsDuplicate,
  getCallNodeInfo,
  getInvertedCallNodeInfo,
  getSampleIndexToCallNodeIndex,
  getOriginAnnotationForFunc,
  createThreadFromDerivedTables,
  computeStackTableFromRawStackTable,
  computeSamplesTableFromRawSamplesTable,
} from 'firefox-profiler/profile-logic/profile-data';
import { getProfileWithDicts } from './profiles/processed-profile';
import { StringTable } from '../../utils/string-table';

import type {
  IndexIntoCallNodeTable,
  RawProfileSharedData,
  Profile,
  Store,
  State,
  Thread,
  IndexIntoStackTable,
  RawThread,
  IndexIntoCategoryList,
  SampleUnits,
} from 'firefox-profiler/types';

import { ensureExists } from 'firefox-profiler/utils/flow';
import { fireEvent, screen } from '@testing-library/react';

/**
 * jsdom's MouseEvent object is incomplete (see
 * https://github.com/jsdom/jsdom/issues/1911) and we use some of the
 * missing properties in our app code. This fake MouseEvent allows the test code
 * to supply these properties.
 */

export type FakeMouseEventInit = $Shape<{
  altKey: boolean;
  button: 0 | 1 | 2 | 3 | 4;
  buttons: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  movementX: number;
  movementY: number;
  offsetX: number;
  offsetY: number;
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
  shiftKey: boolean;
  x: number;
  y: number;

  // From UIEventInit
  detail: number;

  // From EventInit
  bubbles: boolean;
  cancelable: boolean;
  composed: boolean;
}>;

class FakeMouseEvent extends MouseEvent {
  constructor(type: string, values: FakeMouseEventInit) {
    const { pageX, pageY, offsetX, offsetY, x, y, ...mouseValues } = values;
    super(type, mouseValues as any);

    Object.defineProperties(this, {
      offsetX: {
        value: offsetX || 0,
        writable: false,
      },
      offsetY: {
        value: offsetY || 0,
        writable: false,
      },
      pageX: {
        value: pageX || 0,
        writable: false,
      },
      pageY: {
        value: pageY || 0,
        writable: false,
      },
      x: {
        value: x || 0,
        writable: false,
      },
      y: {
        value: y || 0,
        writable: false,
      },
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

export function computeThreadFromRawThread(
  rawThread: RawThread,
  shared: RawProfileSharedData,
  sampleUnits: SampleUnits | undefined,
  referenceCPUDeltaPerMs: number,
  defaultCategory: IndexIntoCategoryList
): Thread {
  const stringTable = StringTable.withBackingArray(shared.stringArray);
  const stackTable = computeStackTableFromRawStackTable(
    rawThread.stackTable,
    rawThread.frameTable,
    defaultCategory
  );
  const samples = computeSamplesTableFromRawSamplesTable(
    rawThread.samples,
    sampleUnits,
    referenceCPUDeltaPerMs
  );
  return createThreadFromDerivedTables(
    rawThread,
    samples,
    stackTable,
    stringTable
  );
}

/**
 * This function retrieves a CallTree object from a profile.
 * It's convenient to use it with formatTree below.
 */
export function callTreeFromProfile(
  profile: Profile,
  threadIndex: number = 0
): CallTree {
  if (!profile.threads[threadIndex]) {
    profile.threads[threadIndex] = getEmptyThread();
  }
  const { derivedThreads, defaultCategory } = getProfileWithDicts(profile);
  const thread = derivedThreads[threadIndex];
  const callNodeInfo = getCallNodeInfo(
    thread.stackTable,
    thread.frameTable,
    defaultCategory
  );
  const callTreeTimings = computeCallTreeTimings(
    callNodeInfo,
    computeCallNodeSelfAndSummary(
      thread.samples,
      getSampleIndexToCallNodeIndex(
        thread.samples.stack,
        callNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
      ),
      callNodeInfo.getCallNodeTable().length
    )
  );
  return getCallTree(
    thread,
    callNodeInfo,
    ensureExists(profile.meta.categories),
    callTreeTimings,
    'samples'
  );
}

/**
 * This function creates the "function list" CallTree object for a profile.
 * It's convenient to use it with formatTree below.
 */
export function functionListTreeFromProfile(
  profile: Profile,
  threadIndex: number = 0
): CallTree {
  if (!profile.threads[threadIndex]) {
    profile.threads[threadIndex] = getEmptyThread();
  }
  const { derivedThreads, defaultCategory } = getProfileWithDicts(profile);
  const thread = derivedThreads[threadIndex];
  const callNodeInfo = getCallNodeInfo(
    thread.stackTable,
    thread.frameTable,
    defaultCategory
  );
  const funcCount = thread.funcTable.length;
  const invertedCallNodeInfo = getInvertedCallNodeInfo(
    callNodeInfo,
    defaultCategory,
    funcCount
  );
  const callNodeTable = callNodeInfo.getCallNodeTable();
  const callNodeFuncIsDuplicate = computeCallNodeFuncIsDuplicate(callNodeTable);
  const functionListTimings = computeFunctionListTimings(
    callNodeTable,
    callNodeFuncIsDuplicate,
    computeCallNodeSelfAndSummary(
      thread.samples,
      getSampleIndexToCallNodeIndex(
        thread.samples.stack,
        callNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
      ),
      callNodeTable.length
    ),
    funcCount
  );
  return getCallTree(
    thread,
    invertedCallNodeInfo,
    ensureExists(profile.meta.categories),
    { type: 'FUNCTION_LIST', timings: functionListTimings },
    'samples'
  );
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

  children.forEach((callNodeIndex) => {
    const { name, total, self, categoryName } =
      callTree.getDisplayData(callNodeIndex);
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

export function formatStack(
  thread: Thread,
  stack: IndexIntoStackTable
): string {
  const lines = [];
  const { stackTable, frameTable, funcTable, stringTable, resourceTable } =
    thread;
  for (
    let stackIndex: IndexIntoStackTable | null = stack;
    stackIndex !== null;
    stackIndex = stackTable.prefix[stackIndex]
  ) {
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const frameLine = frameTable.line[frameIndex];
    const frameColumn = frameTable.column[frameIndex];
    const funcName = stringTable.getString(funcTable.name[funcIndex]);
    const origin = getOriginAnnotationForFunc(
      funcIndex,
      funcTable,
      resourceTable,
      stringTable,
      frameLine,
      frameColumn
    );
    lines.push(`${funcName} (${origin})`);
  }
  lines.reverse();

  return lines.join('\n');
}

/**
 * Wait until the Redux store gets into a specific state given a predicate function.
 * Generally prefer hooking into existing promises, but this can be used in cases,
 * like when clicking a component link in a test, where there is no Promise to
 * wait on.
 */
export function waitUntilState(
  store: Store,
  predicate: (param: State) => boolean
): Promise<void> {
  if (predicate(store.getState())) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
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
 * This waits until the predicate returns something non-undefined.
 * The predicate can return either a direct value or a promise.
 */
export async function waitUntilData<T>(
  predicate: () => Promise<T> | T,
  times: number = 10
): Promise<T> {
  function wait() {
    return new Promise((resolve) => setTimeout(resolve, 50));
  }

  for (let i = 0; i < times; i++) {
    await wait();
    const value = await predicate();
    if (value !== undefined || value !== null) {
      return value;
    }
  }

  throw new Error(`We waited more than ${times} times for a defined value.`);
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

export function addScreenshotHoverlement() {
  const div = document.createElement('div');
  div.id = 'screenshot-hover';
  ensureExists(
    document.body,
    'Expected the document.body to exist.'
  ).appendChild(div);
}

export function removeScreenshotHoverElement() {
  ensureExists(
    document.body,
    'Expected the document.body to exist.'
  ).removeChild(
    ensureExists(
      document.querySelector('#screenshot-hover'),
      'Expected to find a screenshot hover element to clean up.'
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
export function changeSelect({ from, to }: { from: string; to: string }) {
  // Look up the <option> with the text label.
  const option = screen.getByText(to);
  // Fire a change event to the select.
  fireEvent.change(screen.getByDisplayValue(from), {
    target: { value: option.getAttribute('value') },
  });
}

/**
 * Find a single x/y position for a ctx.fillText call.
 */
export function findFillTextPositionFromDrawLog(
  drawLog: any[],
  fillText: string
): { x: number; y: number } {
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

/**
 * React Testing Library only sends one event at a time, but a lot of component logic
 * assumes that events come in a natural cascade. This utility ensures that cascasde
 * gets fired correctly. This also includes the fix to make properties like pageX work.
 */
export function fireFullClick(
  element: HTMLElement,
  options?: FakeMouseEventInit
) {
  fireEvent(element, getMouseEvent('mousedown', options));
  fireEvent(element, getMouseEvent('mouseup', options));
  fireEvent(element, getMouseEvent('click', options));
}

/**
 * This utility will fire a full context menu event as a user would. The options
 * paramter is optional. It will always add the `button` and `buttons` value to
 * ensure that it is correct, unless the ctrlKey is specified, as that is a valid
 * option in macOS to open a context menu.
 */
export function fireFullContextMenu(
  element: HTMLElement,
  options: FakeMouseEventInit = {}
) {
  const isMacContextMenu =
    options.ctrlKey && !options.metaKey && !options.shiftKey && !options.altKey;

  if (!isMacContextMenu) {
    // Ensure that the `options` properties "button" and "buttons" have the correct
    // values of 2, so that tests don't have to specify this. The only time this value
    // would not be 2 is on a Mac context menu event.
    options = {
      ...options,
      button: 2,
      buttons: 2,
    };
  }

  fireEvent(element, getMouseEvent('mousedown', options));
  fireEvent(element, getMouseEvent('mouseup', options));
  fireEvent(element, getMouseEvent('contextmenu', options));
}

/**
 * React Testing Library only sends one event at a time, but a lot of component logic
 * assumes that events come in a natural cascade. This utility ensures that cascasde
 * gets fired more correctly.
 *
 * Note, that this utility is not quite complete in it's implementation. There are
 * more complex interactions with prevent defaulting, and passing in the correct
 * keycode information.
 *
 * For a more complete implementation see:
 * https://github.com/testing-library/user-event/blob/c187639cbc7d2651d3392db6967f614a75a32695/src/type.js#L283
 *
 * And addition Julien's review comments here:
 * https://github.com/firefox-devtools/profiler/pull/2842/commits/6be20eb6eafca56644b1d55010cc1824a1d03695#r501061693
 */
export function fireFullKeyPress(
  element: HTMLElement,
  options: { key: string }
) {
  // Since this is test code, only use QWERTY layout keyboards.
  // Note the key is always converted to lowercase here.
  const codes: { [key: string]: number } = {
    enter: 13,
    escape: 27,
    ' ': 32,
    '?': 191,
    a: 65,
    b: 66,
    c: 67,
    d: 68,
    e: 69,
    f: 70,
    g: 71,
    h: 72,
    i: 73,
    j: 74,
    k: 75,
    l: 76,
    m: 77,
    n: 78,
    o: 79,
    p: 80,
    q: 81,
    r: 82,
    s: 83,
    t: 84,
    u: 85,
    v: 86,
    w: 87,
    x: 88,
    y: 89,
    z: 90,
  };

  // It's important that the codes are correctly configured here, or else the keypress
  // event won't fire.
  // https://github.com/testing-library/react-testing-library/issues/269#issuecomment-455854112
  const optionsConfigured = {
    code: codes[options.key.toLowerCase()],
    charCode: codes[options.key.toLowerCase()],
    keyCode: codes[options.key.toLowerCase()],
    ...options,
  };

  if (!optionsConfigured.code) {
    throw new Error(
      `An unhandled keypress key was encountered: "${options.key}", look it up here:` +
        ` https://keycode.info/ and then add to this function.`
    );
  }

  fireEvent.keyDown(element, optionsConfigured);
  fireEvent.keyPress(element, optionsConfigured);
  fireEvent.keyUp(element, optionsConfigured);
  if (
    ['Enter', ' '].includes(optionsConfigured.key) &&
    isControlInput(element)
  ) {
    // Enter and space trigger a click event on control elements.
    fireEvent.click(element);
  }
}

function isControlInput(element: HTMLElement): boolean {
  return (
    element instanceof HTMLButtonElement ||
    (element instanceof HTMLInputElement &&
      ['button', 'submit', 'clear'].includes(element.type || ''))
  );
}
