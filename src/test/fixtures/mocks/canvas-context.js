/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
type MaybeFn = ((any) => any) | void;
const identity = () => {};

export function autoMockCanvasContext() {
  beforeEach(() => {
    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    const anyWindow: any = window;
    if (anyWindow.Path2D) {
      throw new Error(
        "This mock assumes Path2D isn't defined. Please fix this mock if this changes."
      );
    }
    anyWindow.Path2D = MockPath2D;
    anyWindow.__flushDrawLog = ctx.__flushDrawLog;
  });

  afterEach(() => {
    delete (window: any).Path2D;
    delete (window: any).__flushDrawLog;
  });
}

export function flushDrawLog() {
  return (window: any).__flushDrawLog();
}

function mockCanvasContext() {
  const log: Array<any> = [];

  /**
   * Logs canvas operations. The log will preserve the order of operations, which is
   * important for canvas rendering.
   */
  function spyLog(name: string, fn: MaybeFn = identity) {
    // This function is extremely polymorphic and defies typing.
    return (jest.fn: any)((...args) => {
      if (
        (name === 'fill' || name === 'stroke') &&
        args[0] instanceof MockPath2D
      ) {
        // This is a Path, so we'll insert operations so that everything looks
        // like independent calls have been made.
        const path = args[0];
        log.push(['beginPath']);
        log.push(...path.__operations);
        log.push([name]);
      } else {
        log.push([name, ...args]);
      }
      if (fn) {
        return fn(...args);
      }
      return undefined;
    });
  }

  const canvasContextInstance = new Proxy(
    {
      scale: spyLog('scale'),
      fill: spyLog('fill'),
      fillRect: spyLog('fillRect'),
      fillText: spyLog('fillText'),
      clearRect: spyLog('clearRect'),
      beginPath: spyLog('beginPath'),
      closePath: spyLog('closePath'),
      moveTo: spyLog('moveTo'),
      lineTo: spyLog('lineTo'),
      stroke: spyLog('stroke'),
      arc: spyLog('arc'),
      measureText: spyLog('measureText', (text) => ({
        width: text.length * 5,
      })),
      createLinearGradient: spyLog('createLinearGradient', () => ({
        addColorStop: spyLog('addColorStop'),
      })),
      createPattern: spyLog('createPattern', () => ({})),
      __flushDrawLog: (): Array<any> => {
        const oldLog = log.slice();
        log.splice(0, log.length);
        return oldLog;
      },
    },
    {
      // Record what values are set on the context.
      set(target, property, value) {
        target[property] = value;
        log.push(['set ' + property, value]);
        return true;
      },
    }
  );

  return canvasContextInstance;
}

// Only the function that we use so far are implemented here. Please add some
// more when needed.
class MockPath2D {
  __operations = [];
  moveTo(...args) {
    this.__operations.push(['moveTo', ...args]);
  }
  lineTo(...args) {
    this.__operations.push(['lineTo', ...args]);
  }
  arc(...args) {
    this.__operations.push(['arc', ...args]);
  }
}
