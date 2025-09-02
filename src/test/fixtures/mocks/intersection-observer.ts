/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Type of the item we are going to keep for tracking observers.
 */
type Item = {
  callback: (
    entries: IntersectionObserverEntry[],
    observer: IntersectionObserver
  ) => void;
  elements: Set<HTMLElement>;
  created: number;
};

/**
 * Tracked observers during the testing.
 */
const observers: Map<IntersectionObserver, Item> = new Map();

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
export function autoMockIntersectionObserver(autoTrigger: boolean = true) {
  beforeEach(() => {
    (window as any).IntersectionObserver = jest.fn((cb, options = {}) => {
      const item: Item = {
        callback: cb,
        elements: new Set(),
        created: Date.now(),
      };

      const instance: IntersectionObserver = {
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
  observer: IntersectionObserver,
  item: Item,
  isIntersecting: boolean = true
) {
  const entries: IntersectionObserverEntry[] = [];

  for (const element of item.elements) {
    entries.push({
      boundingClientRect: element.getBoundingClientRect(),
      intersectionRatio: 1,
      intersectionRect: element.getBoundingClientRect(),
      isIntersecting: isIntersecting,
      // `root` is `Element | Document | null`. We can call getBoundingClientRect
      // only if it's an Element.
      rootBounds:
        observer.root && observer.root instanceof Element
          ? observer.root.getBoundingClientRect()
          : null,
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
