/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Minimal browser stand-in for `node:events`, covering what commander uses.
 */

type Listener = (...args: any[]) => void;

export class EventEmitter {
  _listeners: Map<string | symbol, Listener[]> = new Map();

  on(event: string | symbol, listener: Listener): this {
    const listeners = this._listeners.get(event);
    if (listeners === undefined) {
      this._listeners.set(event, [listener]);
    } else {
      listeners.push(listener);
    }
    return this;
  }

  addListener(event: string | symbol, listener: Listener): this {
    return this.on(event, listener);
  }

  once(event: string | symbol, listener: Listener): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string | symbol, listener: Listener): this {
    const listeners = this._listeners.get(event);
    if (listeners !== undefined) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  removeListener(event: string | symbol, listener: Listener): this {
    return this.off(event, listener);
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    const listeners = this._listeners.get(event);
    if (listeners === undefined || listeners.length === 0) {
      return false;
    }
    for (const listener of listeners.slice()) {
      listener.apply(this, args);
    }
    return true;
  }

  listenerCount(event: string | symbol): number {
    return this._listeners.get(event)?.length ?? 0;
  }
}

export default EventEmitter;
