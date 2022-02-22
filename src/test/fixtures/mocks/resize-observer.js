/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * Creating a mock resize observer type because Flow's ResizeObserver
 * type is a bit obsolete.
 */
type MockResizeObserver = {|
  observe: (HTMLElement, ResizeObserverOptions) => void,
  unobserve: (HTMLElement) => void,
  disconnect: () => void,
|};

type ResizeObserverBoxOptions =
  | 'border-box'
  | 'content-box'
  | 'device-pixel-content-box';
type ResizeObserverOptions = {|
  box?: ResizeObserverBoxOptions,
|};

/**
 * Type of the item we are going to keep for tracking observers.
 */
type Item = {|
  callback: (ResizeObserverEntry[], MockResizeObserver) => void,
  elements: Set<HTMLElement>,
|};

/**
 * Tracked observers during the testing.
 */
const observers: Map<MockResizeObserver, Item> = new Map();

/**
 * Call this function inside a `describe` block to automatically define the
 * resize observer.
 */
export function autoMockResizeObserver() {
  beforeEach(() => {
    (window: any).ResizeObserver = jest.fn((cb) => {
      const item = {
        callback: cb,
        elements: new Set(),
      };

      const instance: MockResizeObserver = {
        observe: jest.fn((element: HTMLElement) => {
          item.elements.add(element);
        }),
        unobserve: jest.fn((element: HTMLElement) => {
          item.elements.delete(element);
        }),
        disconnect: jest.fn(() => {
          observers.delete(instance);
        }),
      };

      observers.set(instance, item);

      return instance;
    });
  });

  afterEach(() => {
    delete (window: any).ResizeObserver;
    observers.clear();
  });
}

function triggerSingleObserver(
  observer: MockResizeObserver,
  item: Item,
  newSize: DOMRectReadOnly | void
) {
  const entries: ResizeObserverEntry[] = [];

  for (const element of item.elements) {
    const size = newSize ?? element.getBoundingClientRect();
    entries.push(
      ({
        borderBoxSize: [{ blockSize: size.height, inlineSize: size.width }],
        contentBoxSize: [{ blockSize: size.height, inlineSize: size.width }],
        devicePixelContentBoxSize: [
          {
            blockSize: size.height,
            inlineSize: size.width,
          },
        ],
        contentRect: size,
        target: element,
      }: any)
    );
  }

  // Trigger the ResizeObserver callback with all the entries.
  item.callback(entries, observer);
}

/**
 * Trigger resize observer callbacks.
 * `newSize` defines the new size for all these elements (the same size for all
 * of them, which is probably not accurate but good enough for tests).
 */
export function triggerResizeObservers({
  newSize,
}: {|
  newSize?: DOMRectReadOnly,
|} = {}) {
  for (const [observer, item] of observers) {
    triggerSingleObserver(observer, item, newSize);
  }
}
