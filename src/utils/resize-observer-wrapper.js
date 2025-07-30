/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This implements a wrapper to the ResizeObserver API, so that only one copy of
// a ResizeObserver exists. This is much more performant than having one
// ResizeObserver for each use.
// This was inspired by the code in https://github.com/jaredLunde/react-hook/blob/master/packages/resize-observer/src/index.tsx

export type ResizeObserverCallback = (DOMRectReadOnly) => mixed;
export type ResizeObserverWrapper = {
  subscribe: (elt: HTMLElement, ResizeObserverCallback) => void,
  unsubscribe: (elt: HTMLElement, ResizeObserverCallback) => void,
};

function createResizeObserverWrapper() {
  // This keeps the list of callbacks for each observed element.
  const callbacks: Map<Element, Set<ResizeObserverCallback>> = new Map();
  // This keeps the list of changes while the tab is hidden.
  const dirtyChanges: Map<Element, DOMRectReadOnly> = new Map();

  let _resizeObserver = null;

  function notifyListenersForElement(element: Element, rect: DOMRectReadOnly) {
    const callbacksForElement = callbacks.get(element);
    if (callbacksForElement) {
      callbacksForElement.forEach((callback) => callback(rect));
    }
  }

  function resizeObserverCallback(entries) {
    for (const entry of entries) {
      if (document.hidden) {
        dirtyChanges.set(entry.target, entry.contentRect);
      } else {
        notifyListenersForElement(entry.target, entry.contentRect);
      }
    }
  }

  function visibilityChangeListener() {
    if (!document.hidden) {
      dirtyChanges.forEach((rect, element) =>
        notifyListenersForElement(element, rect)
      );
      dirtyChanges.clear();
    }
  }

  function getResizeObserver() {
    if (!_resizeObserver) {
      _resizeObserver = new ResizeObserver(resizeObserverCallback);
      window.addEventListener('visibilitychange', visibilityChangeListener);
    }
    return _resizeObserver;
  }

  function stopResizeObserver() {
    _resizeObserver = null;
    window.removeEventListener('visibilitychange', visibilityChangeListener);
  }

  return {
    subscribe(element: HTMLElement, callback: ResizeObserverCallback) {
      const callbacksForElement = callbacks.get(element) ?? new Set();
      callbacks.set(element, callbacksForElement);
      callbacksForElement.add(callback);
      getResizeObserver().observe(element);
    },
    unsubscribe(element: HTMLElement, callback: ResizeObserverCallback) {
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
          getResizeObserver().unobserve(element);
        }
        if (callbacks.size === 0) {
          // It's important to clean this up properly so that tests are behaving
          // as expected.
          stopResizeObserver();
        }
      } else {
        console.warn(
          `[ResizeObserverWrapper.unsubscribe] We tried to unregister a callback for an element that wasn't registered in the first place. Ignoring...`
        );
      }
    },
  };
}

let _resizeObserverWrapper: ResizeObserverWrapper | null = null;
export function getResizeObserverWrapper(): ResizeObserverWrapper {
  if (!_resizeObserverWrapper) {
    _resizeObserverWrapper = createResizeObserverWrapper();
  }

  return _resizeObserverWrapper;
}
