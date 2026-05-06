/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';

import type { CssPixels } from '../../types/units';

import './ResizableWithSplitter.css';

type Props = {
  // If 'start', the splitter is placed before the resized element, otherwise after.
  splitterPosition: 'start' | 'end';
  // The CSS property which gets changed if the splitter is dragged.
  controlledProperty:
    | 'width'
    | 'height'
    | 'minWidth'
    | 'minHeight'
    | 'maxWidth'
    | 'maxHeight';
  // The initial size, as a valid CSS length. For example "200px" or "30%".
  // This prop is read only once, during the initial render.
  initialSize: string;
  // True if the value for controlledProperty should be set as a percentage,
  // false if it should be set in CSS "px".
  percent: boolean;
  // An extra className for the outer div.
  className?: string;
  // The sized contents. These are placed inside an element with the className
  // "resizableWithSplitterInner" and should have a non-zero CSS "flex" value
  // set on them, so that they resize when "resizableWithSplitterInner" resizes.
  children: React.ReactNode;
};

type DragState = {
  outerDim: CssPixels;
  parentDim: CssPixels;
  isWidth: boolean;
  splitterPosition: 'start' | 'end';
  percent: boolean;
  startX: number;
  startY: number;
};

export function ResizableWithSplitter({
  splitterPosition,
  controlledProperty,
  initialSize,
  percent,
  className,
  children,
}: Props) {
  const [size, setSize] = React.useState(initialSize);
  const [dragging, setDragging] = React.useState(false);
  const dragState = React.useRef<DragState | null>(null);
  const isWidth =
    controlledProperty === 'width' ||
    controlledProperty === 'maxWidth' ||
    controlledProperty === 'minWidth';
  const orientClassName = isWidth ? 'resizesWidth' : 'resizesHeight';

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) {
        return;
      }
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const outer = e.currentTarget.parentElement;
      const parent = outer?.parentElement;
      if (!outer || !parent) {
        return;
      }
      const outerRect = outer.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      dragState.current = {
        outerDim: isWidth ? outerRect.width : outerRect.height,
        parentDim: isWidth ? parentRect.width : parentRect.height,
        isWidth,
        splitterPosition,
        percent,
        startX: e.pageX,
        startY: e.pageY,
      };
      setDragging(true);
    },
    [isWidth, splitterPosition, percent]
  );

  const applyDrag = React.useCallback(
    (ds: DragState, pageX: number, pageY: number) => {
      const delta = ds.isWidth ? pageX - ds.startX : pageY - ds.startY;
      const adjusted = Math.max(
        0,
        ds.splitterPosition === 'end'
          ? ds.outerDim + delta
          : ds.outerDim - delta
      );
      setSize(
        ds.percent
          ? `${((adjusted / ds.parentDim) * 100).toFixed(2)}%`
          : `${adjusted}px`
      );
    },
    []
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const ds = dragState.current;
      if (!ds) {
        return;
      }
      applyDrag(ds, e.pageX, e.pageY);
    },
    [applyDrag]
  );

  const onPointerUpOrCancel = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const ds = dragState.current;
      if (!ds) {
        return;
      }
      applyDrag(ds, e.pageX, e.pageY);
      dragState.current = null;
      setDragging(false);
    },
    [applyDrag]
  );

  const splitter = (
    <div
      className={classNames('resizableWithSplitterSplitter', orientClassName, {
        dragging,
      })}
      role="separator"
      aria-orientation={isWidth ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={dragging ? onPointerMove : undefined}
      onPointerUp={onPointerUpOrCancel}
      onPointerCancel={onPointerUpOrCancel}
    />
  );

  return (
    <div
      className={classNames(
        'resizableWithSplitterOuter',
        orientClassName,
        className
      )}
      style={{ [controlledProperty]: size }}
    >
      {splitterPosition === 'start' ? splitter : null}
      <div className="resizableWithSplitterInner">{children}</div>
      {splitterPosition === 'end' ? splitter : null}
    </div>
  );
}
