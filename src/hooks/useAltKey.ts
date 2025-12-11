/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

// Global state for Alt key tracking
let isAltPressed = false;
const listeners = new Set<(pressed: boolean) => void>();

// Initialize global event listeners once
if (typeof window !== 'undefined') {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.altKey && !isAltPressed) {
      isAltPressed = true;
      listeners.forEach((listener) => listener(true));
    }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    if (!event.altKey && isAltPressed) {
      isAltPressed = false;
      listeners.forEach((listener) => listener(false));
    }
  };

  const handleBlur = () => {
    // Reset Alt state when window loses focus
    if (isAltPressed) {
      isAltPressed = false;
      listeners.forEach((listener) => listener(false));
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
}

/**
 * Custom hook that tracks whether the Alt key is currently pressed.
 * Returns true when Alt is pressed, false otherwise.
 * The state is global and shared across all component instances.
 */
export function useAltKey(): boolean {
  const [altPressed, setAltPressed] = React.useState(isAltPressed);

  React.useEffect(() => {
    // Set initial state
    setAltPressed(isAltPressed);

    // Subscribe to changes
    const listener = (pressed: boolean) => {
      setAltPressed(pressed);
    };
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return altPressed;
}
