/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
type MaybeFn = ((...args: any[]) => any) | void;
const identity = () => {};

export function autoMockCanvasContext() {
  beforeEach(() => {
    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx as any);

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
    delete (window as any).Path2D;
    delete (window as any).__flushDrawLog;
  });
}

export function flushDrawLog() {
  return (window as any).__flushDrawLog();
}

function mockCanvasContext() {
  const log: Array<any> = [];

  /**
   * Logs canvas operations. The log will preserve the order of operations, which is
   * important for canvas rendering.
   */
  function spyLog(name: string, fn: MaybeFn = identity) {
    // This function is extremely polymorphic and defies typing.
    return (jest.fn as any)((...args: any[]) => {
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
      clip: spyLog('clip'),
      save: spyLog('save'),
      restore: spyLog('restore'),
      fill: spyLog('fill'),
      fillRect: spyLog('fillRect'),
      fillText: spyLog('fillText'),
      clearRect: spyLog('clearRect'),
      beginPath: spyLog('beginPath'),
      closePath: spyLog('closePath'),
      moveTo: spyLog('moveTo'),
      lineTo: spyLog('lineTo'),
      stroke: spyLog('stroke'),
      rect: spyLog('rect'),
      arc: spyLog('arc'),
      measureText: spyLog('measureText', (text: string) => ({
        width: text.length * 5,
      })),
      createLinearGradient: spyLog('createLinearGradient', () => ({
        addColorStop: spyLog('addColorStop'),
      })),
      createPattern: spyLog('createPattern', () => ({})),
      __flushDrawLog: (): Array<any> => {
        return log.splice(0, log.length);
      },
    } as Record<string | symbol, any>,
    {
      // Record what values are set on the context.
      set(
        target: Record<string | symbol, any>,
        property: string | symbol,
        value: any
      ) {
        target[property] = value;
        log.push(['set ' + String(property), value]);
        return true;
      },
    }
  );

  return canvasContextInstance;
}

// Only the function that we use so far are implemented here. Please add some
// more when needed.
class MockPath2D {
  __operations: any[] = [];
  moveTo(...args: any[]) {
    this.__operations.push(['moveTo', ...args]);
  }
  lineTo(...args: any[]) {
    this.__operations.push(['lineTo', ...args]);
  }
  arc(...args: any[]) {
    this.__operations.push(['arc', ...args]);
  }
  rect(...args: any[]) {
    this.__operations.push(['rect', ...args]);
  }
}
