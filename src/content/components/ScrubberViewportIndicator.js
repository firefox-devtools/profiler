// @flow
import React, { PureComponent } from 'react';
import { withSize } from '../with-size';

require('./ScrubberViewportIndicator.css');

import type { CssPixels, HorizontalViewport } from '../../common/types/units';

type Props = {
  width: CssPixels, // provided by withSize
  timelineHorizontalViewport: HorizontalViewport,
};

class ScrubberViewportIndicator extends PureComponent {

  props: Props

  render() {
    const { width, timelineHorizontalViewport } = this.props;

    return (
      <div className='scrubberViewportIndicator'>
        <div className='scrubberViewportIndicatorSide scrubberViewportIndicatorLeft' style={{
          left: `${width * timelineHorizontalViewport.left}px`,
        }} />
        <div className='scrubberViewportIndicatorSide scrubberViewportIndicatorRight' style={{
          right: `${width - width * timelineHorizontalViewport.right}px`,
        }} />
      </div>
    );
  }
}

export default withSize(ScrubberViewportIndicator);
