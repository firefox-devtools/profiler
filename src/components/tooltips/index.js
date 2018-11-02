/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import {
  getTooltipReference,
  getTooltipPosition,
  getTooltipReferenceReactKey,
} from '../../reducers/app';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import { dismissTooltip } from '../../actions/app';

import type { TooltipReference, MousePosition } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const MOUSE_OFFSET_X = 30;
const MOUSE_OFFSET_Y = 21;
const TIMEOUT_TIME = 250;

type StateProps = {|
  tooltipReference: TooltipReference | null,
  tooltipPosition: MousePosition,
  tooltipKey: string | number,
|};

type DispatchProps = {|
  dismissTooltip: typeof dismissTooltip,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  isTimeoutOver: boolean,
  interiorElement: HTMLElement | null,
  isNewContentLaidOut: boolean,
|};

class Tooltip extends React.PureComponent<Props, State> {
  _isMounted: boolean = false;

  state = {
    isTimeoutOver: false,
    interiorElement: null,
    isNewContentLaidOut: false,
  };

  _takeInteriorElementRef = (el: HTMLElement | null) => {
    this.setState({ interiorElement: el });
  };

  componentDidMount() {
    setTimeout(() => {
      this.setState({ isTimeoutOver: true });
      this._isMounted = true;
    }, TIMEOUT_TIME);
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  // TODO - Reviewer please remind me I didn't handle this.
  // componentWillReceiveProps(nextProps: Props) {
  //   if (nextProps.children !== this.props.children) {
  //     // If the children are different, allow them to do an initial lay out on the DOM.
  //     this.setState({ isNewContentLaidOut: false });
  //     this._forceUpdateAfterRAF();
  //   }
  // }

  componentDidUpdate() {
    // Force an additional update to this component if the children content is
    // different as it needs to fully lay out one time on the DOM to proper calculate
    // sizing and positioning.
    const { interiorElement, isNewContentLaidOut } = this.state;
    if (interiorElement && !isNewContentLaidOut) {
      this._forceUpdateAfterRAF();
    }
  }

  /**
   * Children content needs to be on the DOM (not just virtual DOM) in order to correctly
   * calculate the sizing and positioning of the tooltip.
   */
  _forceUpdateAfterRAF() {
    requestAnimationFrame(() => {
      if (this._isMounted) {
        this.setState({ isNewContentLaidOut: true });
      }
    });
  }

  _onMouseLeave = () => {
    this.props.dismissTooltip();
  };

  render() {
    const {
      tooltipReference,
      tooltipPosition: { mouseX, mouseY },
    } = this.props;
    const { interiorElement, isTimeoutOver } = this.state;

    if (!isTimeoutOver) {
      return false;
    }

    const offsetX = interiorElement
      ? Math.max(0, mouseX + interiorElement.offsetWidth - window.innerWidth)
      : 0;

    let offsetY = 0;
    let paddingTop = 0;
    let paddingBottom = 0;
    if (interiorElement) {
      if (
        mouseY + interiorElement.offsetHeight + MOUSE_OFFSET_Y >
        window.innerHeight
      ) {
        offsetY = interiorElement.offsetHeight;
        paddingBottom = MOUSE_OFFSET_Y;
      } else {
        paddingTop = MOUSE_OFFSET_Y;
      }
    }

    const style = {
      left: mouseX - offsetX - MOUSE_OFFSET_X,
      top: mouseY - offsetY,
      paddingTop,
      paddingBottom,
    };

    let contents;
    if (tooltipReference !== null) {
      switch (tooltipReference.type) {
        case 'tracing-marker':
          contents = (
            <MarkerTooltipContents
              tracingMarkerIndex={tooltipReference.tracingMarkerIndex}
              threadIndex={tooltipReference.threadIndex}
            />
          );
          break;
        case 'call-node':
        case 'stack':
          break;
        default:
          console.error(
            'Unhandled tooltip reference type.',
            (tooltipReference: empty)
          );
      }
    }

    return (
      <div className="tooltipContainer">
        {contents ? (
          <div
            className="tooltip"
            style={style}
            ref={this._takeInteriorElementRef}
            onMouseLeave={this._onMouseLeave}
          >
            <div className="tooltipBackground">{contents}</div>
          </div>
        ) : null}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: (state): StateProps => ({
    tooltipReference: getTooltipReference(state),
    tooltipPosition: getTooltipPosition(state),
    tooltipKey: getTooltipReferenceReactKey(state),
  }),
  mapDispatchToProps: {
    dismissTooltip,
  },
  component: Tooltip,
};

export default explicitConnect(options);
