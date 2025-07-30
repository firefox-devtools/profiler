/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { act } from 'firefox-profiler/test/fixtures/testing-library';

/**
 * Creating a mock resize observer type because Flow's ResizeObserver
 * type is a bit obsolete.
 */
type MockResizeObserver = {
  observe: (HTMLElement, ResizeObserverOptions) => void,
  unobserve: (HTMLElement) => void,
  disconnect: () => void,
};

type ResizeObserverBoxOptions =
  | 'border-box'
  | 'content-box'
  | 'device-pixel-content-box';
type ResizeObserverOptions = {
  box?: ResizeObserverBoxOptions,
};

/**
 * Type of the item we are going to keep for tracking observers.
 */
type Item = {
  callback: (ResizeObserverEntry[], MockResizeObserver) => void,
  elements: Set<HTMLElement>,
  scheduledElements: Set<HTMLElement> | null,
};

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
        scheduledElements: null,
      };

      const instance: MockResizeObserver = {
        observe: jest.fn((element: HTMLElement) => {
          item.elements.add(element);
          scheduleTriggerForElement(instance, item, element);
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

function scheduleTriggerForElement(
  observer: MockResizeObserver,
  item: Item,
  element: HTMLElement
) {
  if (item.scheduledElements) {
    item.scheduledElements.add(element);
  } else {
    item.scheduledElements = new Set([element]);
    // This mock assumes requestAnimationFrame is present, either real or as a mock.
    requestAnimationFrame(() => {
      if (!item.scheduledElements) {
        return;
      }

      triggerSingleObserver(observer, item, item.scheduledElements);
      item.scheduledElements = null;
    });
  }
}

function triggerSingleObserver(
  observer: MockResizeObserver,
  item: Item,
  iteratedElements: Iterable<HTMLElement>,
  newSize: DOMRectReadOnly | void
) {
  const entries: ResizeObserverEntry[] = [];

  for (const element of iteratedElements) {
    if (!item.elements.has(element)) {
      // It may been unobserved already
      continue;
    }

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
  act(() => {
    item.callback(entries, observer);
  });
}

/**
 * Trigger resize observer callbacks.
 * `newSize` defines the new size for all these elements (the same size for all
 * of them, which is probably not accurate but good enough for tests).
 */
export function triggerResizeObservers({
  newSize,
}: {
  newSize?: DOMRectReadOnly,
} = {}) {
  for (const [observer, item] of observers) {
    triggerSingleObserver(observer, item, item.elements, newSize);
  }
}
