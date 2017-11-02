/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import bisection from 'bisection';
import clamp from 'clamp';
import arrayMove from 'array-move';
import { getContentRect, getMarginRect } from '../../utils/css-geometry-tools';

import type { DOMRectLiteral } from '../../utils/dom-rect';
import type { Action } from '../../types/actions';

type Props = {|
  orient: 'horizontal' | 'vertical',
  tagName: string,
  className: string,
  order: number[],
  onChangeOrder: (number[]) => Action,
  // This forces the children to be an array of React Elements.
  // See https://flow.org/en/docs/react/children/ for more information.
  children: React.ChildrenArray<React.Element<any>>,
|};

type State = {|
  phase: 'RESTING' | 'FINISHING' | 'MANIPULATING',
  manipulatingIndex: number,
  destinationIndex: number,
  manipulationDelta: number,
  adjustPrecedingBy: number,
  adjustSucceedingBy: number,
  finalOffset: number,
|};

type XY = {|
  pageXY: 'pageX' | 'pageY',
  translateXY: 'translateX' | 'translateY',
  lefttop: 'left' | 'top',
  rightbottom: 'right' | 'bottom',
|};

type EventWithPageProperties = { pageX: number, pageY: number };

class Reorderable extends React.PureComponent<Props, State> {
  _xy: {| horizontal: XY, vertical: XY |};
  _container: HTMLElement | null;

  constructor(props: Props) {
    super(props);
    (this: any)._setContainerRef = this._setContainerRef.bind(this);
    (this: any)._onMouseDown = this._onMouseDown.bind(this);
    this.state = {
      phase: 'RESTING',
      manipulatingIndex: -1,
      destinationIndex: -1,
      manipulationDelta: 0,
      adjustPrecedingBy: 0,
      adjustSucceedingBy: 0,
      finalOffset: 0,
    };

    this._xy = {
      horizontal: {
        pageXY: 'pageX',
        translateXY: 'translateX',
        lefttop: 'left',
        rightbottom: 'right',
      },
      vertical: {
        pageXY: 'pageY',
        translateXY: 'translateY',
        lefttop: 'top',
        rightbottom: 'bottom',
      },
    };
  }

  _setContainerRef(container: HTMLElement | null) {
    this._container = container;
  }

  _onMouseDown(event: SyntheticMouseEvent<>) {
    if (
      !this._container ||
      event.currentTarget === this._container ||
      !(event.currentTarget instanceof HTMLElement) ||
      // Only run for left clicks.
      event.button !== 0
    ) {
      return;
    }
    // Flow: Coerce the event target into an HTMLElement in combination with the above
    // `instanceof` statement.
    let element = (event.currentTarget: HTMLElement);
    if (!element.matches('.grippy, .grippy *')) {
      // Don't handle this event. Only clicking inside a grippy should start the dragging process.
      return;
    }

    while (
      element instanceof HTMLElement &&
      element.parentNode !== this._container
    ) {
      element = element.parentNode;
    }

    if (!(element instanceof HTMLElement)) {
      return;
    }

    // Double check the container still exists for flow.
    if (this._container) {
      this._startDraggingElement(this._container, element, event);
    }
  }

  _getXY(): XY {
    return this._xy[this.props.orient];
  }

  _startDraggingElement(
    container: HTMLElement,
    element: HTMLElement,
    event: EventWithPageProperties
  ) {
    const xy = this._getXY();
    // Coerce the SyntheticMouseEvent and DOMRect instances into an object literals
    // to dynamically access certain properties.
    const mouseDownPos = event[xy.pageXY];
    const elementRect: DOMRectLiteral = getMarginRect(element);
    const containerRect: DOMRectLiteral = getContentRect(container);
    const spaceBefore = elementRect[xy.lefttop] - containerRect[xy.lefttop];
    const spaceAfter =
      containerRect[xy.rightbottom] - elementRect[xy.rightbottom];

    const children = Array.from(container.children);
    if (children.length < 2) {
      return;
    }

    let isBefore = true;
    let elementIndex = -1;
    const offsets = children.map((child, childIndex) => {
      if (child === element) {
        elementIndex = childIndex;
        isBefore = false;
        return 0;
      }
      const childRect: DOMRectLiteral = getMarginRect(child);
      return isBefore
        ? childRect[xy.lefttop] - elementRect[xy.lefttop]
        : childRect[xy.rightbottom] - elementRect[xy.rightbottom];
    });

    if (elementIndex === -1) {
      return;
    }

    const midPoints = offsets.map((offset, childIndex) => {
      if (childIndex === offsets.length - 1) {
        // This will be popped off at the end.
        return 0;
      }
      return (offsets[childIndex + 1] + offset) / 2;
    });
    midPoints.pop();

    const nextEdgeAfterElement =
      elementIndex === children.length - 1
        ? containerRect[xy.rightbottom]
        : (getMarginRect(children[elementIndex + 1]): DOMRectLiteral)[
            xy.lefttop
          ];

    const nextEdgeBeforeElement =
      elementIndex === 0
        ? containerRect[xy.lefttop]
        : (getMarginRect(children[elementIndex - 1]): DOMRectLiteral)[
            xy.rightbottom
          ];

    this.setState({
      phase: 'MANIPULATING',
      manipulatingIndex: elementIndex,
      manipulationDelta: 0,
      destinationIndex: elementIndex,
      adjustPrecedingBy: nextEdgeAfterElement - elementRect[xy.lefttop],
      adjustSucceedingBy: nextEdgeBeforeElement - elementRect[xy.rightbottom],
    });

    const mouseMoveListener = (event: EventWithPageProperties) => {
      const delta = clamp(
        event[xy.pageXY] - mouseDownPos,
        -spaceBefore,
        spaceAfter
      );
      this.setState({
        manipulationDelta: delta,
        destinationIndex: bisection.right(midPoints, delta),
      });
    };
    const mouseUpListener = (event: EventWithPageProperties) => {
      mouseMoveListener(event);
      const destinationIndex = this.state.destinationIndex;
      this.setState({
        phase: 'FINISHING',
        finalOffset: offsets[destinationIndex],
      });
      window.removeEventListener('mousemove', mouseMoveListener, true);
      window.removeEventListener('mouseup', mouseUpListener, true);
      setTimeout(() => {
        this.setState({
          phase: 'RESTING',
        });
        if (elementIndex !== destinationIndex) {
          const newOrder = arrayMove(
            this.props.order,
            elementIndex,
            destinationIndex
          );
          this.props.onChangeOrder(newOrder);
        }
      }, 200);
    };
    window.addEventListener('mousemove', mouseMoveListener, true);
    window.addEventListener('mouseup', mouseUpListener, true);
  }

  render() {
    const { className, order } = this.props;
    const children = React.Children.toArray(this.props.children);
    const orderedChildren = order.map(childIndex => children[childIndex]);
    const TagName = this.props.tagName;
    const xy = this._getXY();

    if (this.state.phase === 'RESTING') {
      return (
        <TagName
          className={className}
          onMouseDown={this._onMouseDown}
          ref={this._setContainerRef}
        >
          {orderedChildren}
        </TagName>
      );
    }

    const {
      phase,
      manipulatingIndex,
      destinationIndex,
      adjustPrecedingBy,
      adjustSucceedingBy,
    } = this.state;
    const adjustedClassName =
      phase === 'MANIPULATING' ? className + ' beingReordered' : className;
    return (
      <TagName className={adjustedClassName} ref={this._setContainerRef}>
        {orderedChildren.map((child, childIndex) => {
          const style = {
            transition: '200ms ease-in-out transform',
            willChange: 'transform',
            position: 'relative',
            zIndex: '1',
            transform: '',
          };
          if (childIndex === manipulatingIndex) {
            style.zIndex = '2';
            if (phase === 'MANIPULATING') {
              delete style.transition;
              style.transform = `${xy.translateXY}(${this.state
                .manipulationDelta}px)`;
            } else {
              style.transform = `${xy.translateXY}(${this.state
                .finalOffset}px)`;
            }
          } else if (
            childIndex < manipulatingIndex &&
            childIndex >= destinationIndex
          ) {
            style.transform = `${xy.translateXY}(${adjustPrecedingBy}px)`;
          } else if (
            childIndex > manipulatingIndex &&
            childIndex <= destinationIndex
          ) {
            style.transform = `${xy.translateXY}(${adjustSucceedingBy}px)`;
          }
          return React.cloneElement(child, { style });
        })}
      </TagName>
    );
  }
}

export default Reorderable;
