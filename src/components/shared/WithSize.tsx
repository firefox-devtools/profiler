/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import type { CssPixels } from 'firefox-profiler/types';
import { getResizeObserverWrapper } from 'firefox-profiler/utils/resize-observer-wrapper';

type SizeState = {
  width: CssPixels;
  height: CssPixels;
};

export type SizeProps = Readonly<SizeState>;

export type PropsWithSize<Props> = Props & SizeProps;

/**
 * Wraps a React component and makes 'width' and 'height' available in the
 * wrapped component's props. These props start out at zero and are updated to
 * the component's DOM node's getBoundingClientRect().width/.height after the
 * component has been mounted. They also get updated whenever the element's
 * size changes.
 */
export function withSize<Props>(
  Wrapped: React.ComponentType<PropsWithSize<Props>>
): React.ComponentType<Props> {
  return function WithSizeWrapper(props: Props) {
    const [size, setSize] = React.useState<SizeState>({ width: 0, height: 0 });
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return undefined;
      }
      const child = wrapper.firstElementChild as HTMLElement | null;
      if (!child) {
        throw new Error(
          'WithSize: the wrapped component must render a DOM element as its root.'
        );
      }
      const listener = (contentRect: DOMRectReadOnly) => {
        setSize({ width: contentRect.width, height: contentRect.height });
      };
      getResizeObserverWrapper().subscribe(child, listener);
      return () => {
        getResizeObserverWrapper().unsubscribe(child, listener);
      };
    }, []);

    return (
      <div ref={wrapperRef} style={{ display: 'contents' }}>
        <Wrapped {...props} {...size} />
      </div>
    );
  };
}
