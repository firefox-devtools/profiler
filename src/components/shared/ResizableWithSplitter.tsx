/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import { Draggable } from './Draggable';
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
    | 'min-width'
    | 'min-height'
    | 'max-width'
    | 'max-height';
  // The initial size, as a valid CSS length. For example "200px" or "30%".
  // This prop is read only once, during componentDidMount.
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

type State = {
  size: string;
};

type Size = { width: CssPixels; height: CssPixels };

export class ResizableWithSplitter extends React.PureComponent<Props, State> {
  override state = {
    size: '0px',
  };

  _outer = React.createRef<HTMLDivElement>();

  _onMove = (
    originalValue: { outerSize: Size; parentSize: Size },
    dx: number,
    dy: number
  ) => {
    const { controlledProperty, splitterPosition, percent } = this.props;
    if (controlledProperty.endsWith('width')) {
      const growsToRight = splitterPosition === 'end';
      const originalWidth = originalValue.outerSize.width;
      const adjustedWidth = growsToRight
        ? Math.max(0, originalWidth + dx)
        : Math.max(0, originalWidth - dx);
      if (percent) {
        const fraction = adjustedWidth / originalValue.parentSize.width;
        this.setState({ size: `${(fraction * 100).toFixed(2)}%` });
      } else {
        this.setState({ size: `${adjustedWidth}px` });
      }
    } else {
      const growsDownwards = splitterPosition === 'end';
      const originalHeight = originalValue.outerSize.height;
      const adjustedHeight = growsDownwards
        ? Math.max(0, originalHeight + dy)
        : Math.max(0, originalHeight - dy);
      if (percent) {
        const fraction = adjustedHeight / originalValue.parentSize.height;
        this.setState({ size: `${(fraction * 100).toFixed(2)}%` });
      } else {
        this.setState({ size: `${adjustedHeight}px` });
      }
    }
  };

  override componentDidMount() {
    this.setState({
      size: this.props.initialSize,
    });
  }

  _getMoveStartState = () => {
    const outer = this._outer.current;
    const parent = outer?.parentElement;
    if (!outer || !parent) {
      throw new Error('Dragging splitter before ref is known, or no parent?');
    }

    const outerRect = outer.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return {
      outerSize: { width: outerRect.width, height: outerRect.height },
      parentSize: { width: parentRect.width, height: parentRect.height },
    };
  };

  _getOrientClassName() {
    return this.props.controlledProperty.endsWith('width')
      ? 'resizesWidth'
      : 'resizesHeight';
  }

  override render() {
    const { splitterPosition, controlledProperty, className, children } =
      this.props;
    const { size } = this.state;
    const orientClassName = this._getOrientClassName();
    const splitter = (
      <Draggable
        className={classNames('resizableWithSplitterSplitter', orientClassName)}
        getInitialValue={this._getMoveStartState}
        onMove={this._onMove}
      ></Draggable>
    );
    return (
      <div
        className={classNames(
          'resizableWithSplitterOuter',
          orientClassName,
          className
        )}
        style={{ [controlledProperty]: size }}
        ref={this._outer}
      >
        {splitterPosition === 'start' ? splitter : null}
        <div className="resizableWithSplitterInner">{children}</div>
        {splitterPosition === 'end' ? splitter : null}
      </div>
    );
  }
}
