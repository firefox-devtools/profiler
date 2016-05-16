import React, { Component, PropTypes } from 'react';
import bisection from 'bisection';
import clamp from 'clamp';
import arrayMove from 'array-move';

class Reorderable extends Component {

  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
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

  _onMouseDown(event) {
    if (!this.refs.container || event.target === this.refs.container) {
      return;
    }

    if (!event.target.matches('.grippy, .grippy *')) {
      // Don't handle this event. Only clicking inside a grippy should start the dragging process.
      return;
    }

    let element = event.target;
    while (element && element.parentNode !== this.refs.container) {
      element = element.parentNode;
    }

    if (!element) {
      return;
    }

    this._startDraggingElement(this.refs.container, element, event);
  }

  _getXY() {
    return this._xy[this.props.orient];
  }

  _startDraggingElement(container, element, event) {
    const xy = this._getXY();
    const mouseDownPos = event[xy.pageXY];
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const spaceBefore = elementRect[xy.lefttop] - containerRect[xy.lefttop];
    const spaceAfter = containerRect[xy.rightbottom] - elementRect[xy.rightbottom];

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
      const childRect = child.getBoundingClientRect();
      return isBefore ? childRect[xy.lefttop] - elementRect[xy.lefttop]
                      : childRect[xy.rightbottom] - elementRect[xy.rightbottom];
    });

    if (elementIndex === -1) {
      return;
    }

    const midPoints = offsets.map((offset, childIndex) => {
      if (childIndex === offsets.length - 1) {
        return null;
      }
      return (offsets[childIndex + 1] + offset) / 2;
    });
    midPoints.pop();

    const nextEdgeAfterElement = (elementIndex === children.length - 1)
      ? containerRect[xy.rightbottom]
      : children[elementIndex + 1].getBoundingClientRect()[xy.lefttop];

    const nextEdgeBeforeElement = (elementIndex === 0)
      ? containerRect[xy.lefttop]
      : children[elementIndex - 1].getBoundingClientRect()[xy.rightbottom];

    this.setState({
      phase: 'MANIPULATING',
      manipulatingIndex: elementIndex,
      manipulationDelta: 0,
      destinationIndex: elementIndex,
      adjustPrecedingBy: (nextEdgeAfterElement - elementRect[xy.lefttop]),
      adjustSucceedingBy: (nextEdgeBeforeElement - elementRect[xy.rightbottom]),
    });

    const mouseMoveListener = event => {
      const delta = clamp(event[xy.pageXY] - mouseDownPos, -spaceBefore, spaceAfter);
      this.setState({
        manipulationDelta: delta,
        destinationIndex: bisection.right(midPoints, delta),
      });
    };
    const mouseUpListener = event => {
      mouseMoveListener(event);
      const destinationIndex = this.state.destinationIndex;
      this.setState({
        phase: 'FINISHING',
        finalOffset: offsets[destinationIndex],
      });
      window.removeEventListener('mousemove', mouseMoveListener, true);
      window.removeEventListener('mouseup', mouseUpListener, true);
      setTimeout(() => {
        const newOrder = arrayMove(this.props.order, elementIndex, destinationIndex);
        this.setState({
          phase: 'RESTING',
        });
        this.props.onChangeOrder(newOrder);
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
        <TagName className={className} onMouseDown={this._onMouseDown} ref='container'>
          { orderedChildren }
        </TagName>
      );
    }

    const { phase, manipulatingIndex, destinationIndex, adjustPrecedingBy, adjustSucceedingBy } = this.state;
    return (
      <TagName className={className} ref='container'>
        {
          orderedChildren.map((child, childIndex) => {
            const style = {
              transition: '200ms ease-in-out transform',
              willChange: 'transform',
              position: 'relative',
              zIndex: '1',
            };
            if (childIndex === manipulatingIndex) {
              style.zIndex = '2';
              if (phase === 'MANIPULATING') {
                delete style.transition;
                style.transform = `${xy.translateXY}(${this.state.manipulationDelta}px)`;
                style.opacity = '0.8';
              } else {
                style.transform = `${xy.translateXY}(${this.state.finalOffset}px)`;
              }
            } else if (childIndex < manipulatingIndex && childIndex >= destinationIndex) {
              style.transform = `${xy.translateXY}(${adjustPrecedingBy}px)`;
            } else if (childIndex > manipulatingIndex && childIndex <= destinationIndex) {
              style.transform = `${xy.translateXY}(${adjustSucceedingBy}px)`;
            }
            return React.cloneElement(child, { style });
          })
        }
      </TagName>
    );
  }

}

Reorderable.propTypes = {
  orient: PropTypes.string.isRequired,
  tagName: PropTypes.string.isRequired,
  className: PropTypes.string,
  order: PropTypes.arrayOf(PropTypes.number).isRequired,
  onChangeOrder: PropTypes.func.isRequired,
  children: PropTypes.children,
};

export default Reorderable;
