// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';

type Props = {
  duration: number,
  title: string,
  className?: string,
};

export default class TooltipHeaderWithDuration extends PureComponent {
  props: Props;

  render(): React$Element<*> {
    console.log('PLOP3');
    let { duration } = this.props;
    if (duration >= 10) {
      duration = duration.toFixed(0);
    } else if (duration >= 1) {
      duration = duration.toFixed(1);
    } else if (duration >= 0.1) {
      duration = duration.toFixed(2);
    } else {
      duration = duration.toFixed(3);
    }

    return (
      <div className={classNames('tooltipOneLine', this.props.className)}>
        <div className="tooltipTiming">
          {duration}ms
        </div>
        <div className="tooltipTitle">
          {this.props.title}
        </div>
      </div>
    );
  }
}
