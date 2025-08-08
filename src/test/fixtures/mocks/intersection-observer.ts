/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @ts-nocheck Complex DOM mock with intricate typing that would require extensive work to properly type

/**
 * Creating a mock intersection observer type because Flow's IntersectionObserver
 * type is not completely correct in this version.
 */
type MockIntersectionObserver = {
  thresholds: number[];
  root: HTMLElement | Document;
  rootMargin: string;
  observe: (param: HTMLElement) => void;
  unobserve: (param: HTMLElement) => void;
  disconnect: () => void;
  takeRecords: () => void;
};

/**
 * Type of the item we are going to keep for tracking observers.
 */
type Item = {
  callback: (
    param: IntersectionObserverEntry[],
    MockIntersectionObserver
  ) => void;
  elements: Set<HTMLElement>;
  created: number;
};

/**
 * Tracked observers during the testing.
 */
const observers: Map<MockIntersectionObserver, Item> = new Map<
  unknown,
  unknown
>();

/**
 * Call this function inside a `describe` block to automatically define the
 * intersection observer.
 *
 * If the autoTrigger parameter is true, it will automatically trigger the
 * intersection callback with `isIntersecting` = true. This means that it will
 * work like the component is already visible in the viewport. This is useful
 * when you don't want to test the behavior of intersection observer. If
 * autoTrigger is false, it will not call the callback automatically, so you can
 * do it manually with `triggerIntersectionObservers` when you need to. This will
 * give you a better control over the intersection observer and is used mostly
 * when you want to test the intersection observer behavior.
 */
export function autoMockIntersectionObserver(autoTrigger?: boolean = true) {
  beforeEach(() => {
    (window as any).IntersectionObserver = jest.fn((cb, options = {}) => {
      const item = {
        callback: cb,
        elements: new Set(),
        created: Date.now(),
      };

      const instance: MockIntersectionObserver = {
        thresholds: Array.isArray(options.threshold)
          ? options.threshold
          : [options.threshold ?? 0],
        root: options.root ?? null,
        rootMargin: options.rootMargin ?? '',
        observe: jest.fn((element: HTMLElement) => {
          item.elements.add(element);
          if (autoTrigger) {
            triggerSingleObserver(instance, item);
          }
        }),
        unobserve: jest.fn((element: HTMLElement) => {
          item.elements.delete(element);
        }),
        disconnect: jest.fn(() => {
          observers.delete(instance);
        }),
        takeRecords: jest.fn(),
      };

      observers.set(instance, item);

      return instance;
    });
  });

  afterEach(() => {
    delete (window as any).IntersectionObserver;
    observers.clear();
  });
}

function triggerSingleObserver(
  observer: MockIntersectionObserver,
  item: Item,
  isIntersecting: boolean = true
) {
  const entries: IntersectionObserverEntry[] = [];

  for (const element of item.elements) {
    entries.push({
      // $FlowExpectError Flow thinks they are different but they are both DOMRectReadOnly.
      boundingClientRect: element.getBoundingClientRect(),
      intersectionRatio: 1,
      // $FlowExpectError Flow thinks they are different but they are both DOMRectReadOnly.
      intersectionRect: element.getBoundingClientRect(),
      isIntersecting: isIntersecting,
      rootBounds: observer.root
        ? // $FlowExpectError Flow thinks they are different but they are both DOMRectReadOnly.
          observer.root.getBoundingClientRect()
        : // $FlowExpectError We don't know anything, so putting null instead.
          null,

      target: element,
      time: Date.now() - item.created,
    });
  }

  // Trigger the IntersectionObserver callback with all the entries.
  item.callback(entries, observer);
}

/**
 * Trigger intersection observer callbacks.
 * `isIntersecting` can be false for hidden elements and true for visible ones.
 */
export function triggerIntersectionObservers({
  isIntersecting = true,
}: {
  isIntersecting?: boolean;
}) {
  for (const [observer, item] of observers) {
    triggerSingleObserver(observer, item, isIntersecting);
  }
}
