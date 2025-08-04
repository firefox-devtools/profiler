/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import clamp from 'clamp';
import arrayMove from 'array-move';
import {
  getContentRect,
  getMarginRect,
  extractDomRectValue,
} from 'firefox-profiler/utils/css-geometry-tools';
import { bisectionRight } from 'firefox-profiler/utils/bisect';

type Props = {
  orient: 'horizontal' | 'vertical';
  tagName: React.ElementType;
  className: string;
  order: number[];
  onChangeOrder: (param: number[]) => mixed;
  // Reorderable elements should set a class name to match against. This allows
  // nested reorderable elements to set different matching class names.
  grippyClassName: string;
  // This forces the children to be an array of React Elements.
  // See https://flow.org/en/docs/react/children/ for more information.
  // Be careful: children need to handle a `style` property.
  children: React.ReactElement<any>[];
  // If present, this will be attached to the container added for these
  // children. As a reminder, the container will use the tagName defined above.
  innerElementRef?: React.Ref<any>;
};

type State = {
  phase: 'RESTING' | 'FINISHING' | 'MANIPULATING';
  manipulatingIndex: number;
  destinationIndex: number;
  manipulationDelta: number;
  adjustPrecedingBy: number;
  adjustSucceedingBy: number;
  finalOffset: number;
};

type XY = {
  pageXY: 'pageX' | 'pageY';
  translateXY: 'translateX' | 'translateY';
  lefttop: 'left' | 'top';
  rightbottom: 'right' | 'bottom';
};

type EventWithPageProperties = { pageX: number; pageY: number };

export class Reorderable extends React.PureComponent<Props, State> {
  _xy: { horizontal: XY; vertical: XY } = {
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

  override state = {
    phase: 'RESTING' as const,
    manipulatingIndex: -1,
    destinationIndex: -1,
    manipulationDelta: 0,
    adjustPrecedingBy: 0,
    adjustSucceedingBy: 0,
    finalOffset: 0,
  };

  _onMouseDown = (
    event: { target: EventTarget } & React.MouseEvent<HTMLElement>
  ) => {
    const container = event.currentTarget;

    if (
      event.target === container ||
      !(event.target instanceof HTMLElement) ||
      // Only run for left clicks.
      event.button !== 0
    ) {
      return;
    }

    // Flow: Coerce the event target into an HTMLElement in combination with the above
    // `instanceof` statement.
    let element = event.target as HTMLElement;
    const { grippyClassName } = this.props;
    if (!element.matches(`.${grippyClassName}, .${grippyClassName} *`)) {
      // Don't handle this event. Only clicking inside a matching grippy class
      // name should start the dragging process.
      return;
    }

    while (element instanceof HTMLElement && element.parentNode !== container) {
      element = element.parentNode as HTMLElement;
    }

    if (!(element instanceof HTMLElement)) {
      return;
    }

    this._startDraggingElement(container, element, event);
  };

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
    const elementRect = getMarginRect(element);
    const containerRect = getContentRect(container);
    const spaceBefore =
      extractDomRectValue(elementRect, xy.lefttop) -
      extractDomRectValue(containerRect, xy.lefttop);
    const spaceAfter =
      extractDomRectValue(containerRect, xy.rightbottom) -
      extractDomRectValue(elementRect, xy.rightbottom);

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
      const childRect = getMarginRect(child as HTMLElement);
      return isBefore
        ? extractDomRectValue(childRect, xy.lefttop) -
            extractDomRectValue(elementRect, xy.lefttop)
        : extractDomRectValue(childRect, xy.rightbottom) -
            extractDomRectValue(elementRect, xy.rightbottom);
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
        ? extractDomRectValue(containerRect, xy.rightbottom)
        : extractDomRectValue(
            getMarginRect(children[elementIndex + 1] as HTMLElement),
            xy.lefttop
          );

    const nextEdgeBeforeElement =
      elementIndex === 0
        ? extractDomRectValue(containerRect, xy.lefttop)
        : extractDomRectValue(
            getMarginRect(children[elementIndex - 1] as HTMLElement),
            xy.rightbottom
          );

    this.setState({
      manipulatingIndex: elementIndex,
      manipulationDelta: 0,
      destinationIndex: elementIndex,
      adjustPrecedingBy:
        nextEdgeAfterElement - extractDomRectValue(elementRect, xy.lefttop),
      adjustSucceedingBy:
        nextEdgeBeforeElement -
        extractDomRectValue(elementRect, xy.rightbottom),
    });

    const mouseMoveListener = (event: EventWithPageProperties) => {
      if (this.state.phase === 'RESTING') {
        // Only start manipulating on the mouse move.
        this.setState({ phase: 'MANIPULATING' });
      }
      const delta = clamp(
        event[xy.pageXY] - mouseDownPos,
        -spaceBefore,
        spaceAfter
      );
      this.setState({
        manipulationDelta: delta,
        destinationIndex: bisectionRight(midPoints, delta),
      });
    };
    const mouseUpListener = (event: EventWithPageProperties) => {
      window.removeEventListener('mousemove', mouseMoveListener, true);
      window.removeEventListener('mouseup', mouseUpListener, true);
      if (this.state.phase === 'RESTING') {
        // A mousemove never transitioned to the MANIPULATING state, so
        // exit out now.
        return;
      }
      mouseMoveListener(event);
      const destinationIndex = this.state.destinationIndex;
      this.setState({
        phase: 'FINISHING',
        finalOffset: offsets[destinationIndex],
      });
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

  override render() {
    const { className, order, innerElementRef } = this.props;
    const children = React.Children.toArray(this.props.children);
    const orderedChildren = order.map((childIndex) => children[childIndex]);
    const TagName = this.props.tagName;
    const xy = this._getXY();

    if (this.state.phase === 'RESTING') {
      return (
        <TagName
          className={className}
          onMouseDown={this._onMouseDown}
          ref={innerElementRef}
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

    return (
      <TagName className={className} ref={innerElementRef}>
        {orderedChildren.map((child, childIndex) => {
          const style: React.CSSProperties = {
            transition: '200ms ease-in-out transform',
            willChange: 'transform',
            position: 'relative',
            zIndex: 1,
            transform: '',
          };
          if (childIndex === manipulatingIndex) {
            style.zIndex = 2;
            if (phase === 'MANIPULATING') {
              delete style.transition;
              style.transform = `${xy.translateXY}(${this.state.manipulationDelta}px)`;
            } else {
              style.transform = `${xy.translateXY}(${this.state.finalOffset}px)`;
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

          // Note: the child element needs to handle this `style` property.
          return React.cloneElement(child as React.ReactElement<any>, {
            style,
          });
        })}
      </TagName>
    );
  }
}
