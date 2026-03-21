/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { FullTimeline } from 'firefox-profiler/components/timeline/FullTimeline';

type TimelineProps = {
  readonly onSelectionMove?: () => void;
};

export class Timeline extends PureComponent<TimelineProps> {
  // This may contain a function that's called whenever we want to remove the
  // "wheel" listener.
  _removeWheelListener: null | (() => void) = null;

  // This effectively disable the pinch-to-zoom as well as ctrl+mousewheel
  // gestures. Indeed in the timeline it is confusing. In the future we'll want
  // to couple this with the preview selection like in the Viewport HOC.
  preventPinchToZoom(e: WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }

  // This will be registered as a ref property to the DOM element displaying the
  // tracks. We use this solution of registering the wheel event in this ref
  // listener because:
  // * we can't use React's event handling, because it doesn't allow us to use
  //   the "passive: false" way of registering the event handler. But we need this
  //   if we want to be able to prevent the default action of page zooming.
  // * we want to be sure to register it whenever the element changes.
  _onTimelineMountWithRef = (ref: HTMLElement | null) => {
    if (this._removeWheelListener) {
      this._removeWheelListener();
      this._removeWheelListener = null;
    }

    if (!ref) {
      return;
    }

    // without pinning to a const variable, Flow isn't sure that we don't change
    // the `ref` variable in some of the function calls below, and therefore
    // that it won't be null.
    const existingRef = ref;

    // Disable pinch-to-zoom and ctrl + wheel otherwise, on the timeline.
    // Indeed the users are used to this gesture  to zoom in in our charts, and
    // may use the same gesture elsewhere because of their habits, however this
    // doesn't do what they expect and instead zooms in the page, which is distracting.
    existingRef.addEventListener('wheel', this.preventPinchToZoom, {
      passive: false,
    } as AddEventListenerOptions);

    this._removeWheelListener = () => {
      existingRef.removeEventListener('wheel', this.preventPinchToZoom, {
        passive: false,
      } as EventListenerOptions);
    };
  };

  override componentWillUnmount() {
    if (this._removeWheelListener) {
      this._removeWheelListener();
      this._removeWheelListener = null;
    }
  }

  override render() {
    const { onSelectionMove } = this.props;

    return (
      <FullTimeline
        innerElementRef={this._onTimelineMountWithRef}
        onSelectionMove={onSelectionMove}
      />
    );
  }
}
