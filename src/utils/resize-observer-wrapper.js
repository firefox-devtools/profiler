/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This implements a wrapper to the ResizeObserver API, so that only one copy of
// a ResizeObserver exists. This is much more performant than having one
// ResizeObserver for each use.
// This was inspired by the code in https://github.com/jaredLunde/react-hook/blob/master/packages/resize-observer/src/index.tsx

function createResizeObserverWrapper() {
  // This keeps the list of callbacks for each observed element.
  const callbacks: Map<Element, Set<() => mixed>> = new Map();
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const callbacksForElement = callbacks.get(entry.target);
      if (callbacksForElement) {
        callbacksForElement.forEach((callback) => callback());
      }
    }
  });

  return {
    subscribe(element: HTMLElement, callback: () => mixed) {
      const callbacksForElement = callbacks.get(element) ?? new Set();
      callbacks.set(element, callbacksForElement);
      callbacksForElement.add(callback);
      resizeObserver.observe(element);
    },
    unsubscribe(element: HTMLElement, callback: () => mixed) {
      const callbacksForElement = callbacks.get(element);
      if (callbacksForElement) {
        const wasDeleted = callbacksForElement.delete(callback);
        if (!wasDeleted) {
          console.warn(
            `[ResizeObserverWrapper.unsubscribe] We tried to unregister an unknown callback.`
          );
        }
        if (callbacksForElement.size === 0) {
          callbacks.delete(element);
          resizeObserver.unobserve(element);
        }
        if (callbacks.size === 0) {
          // It's important to clean this up properly so that tests are behaving
          // as expected.
          _resizeObserverWrapper = null;
        }
      } else {
        console.warn(
          `[ResizeObserverWrapper.unsubscribe] We tried to unregister a callback for an element that wasn't registered in the first place. Ignoring...`
        );
      }
    },
  };
}

type ResizeObserverWrapper = {|
  subscribe: (elt: HTMLElement, callback: () => mixed) => void,
  unsubscribe: (elt: HTMLElement, callback: () => mixed) => void,
|};

let _resizeObserverWrapper: ResizeObserverWrapper | null = null;
export function getResizeObserverWrapper(): ResizeObserverWrapper {
  if (!_resizeObserverWrapper) {
    _resizeObserverWrapper = createResizeObserverWrapper();
  }

  return _resizeObserverWrapper;
}
