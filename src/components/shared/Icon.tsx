/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getIconClassName } from 'firefox-profiler/selectors/icons';
import { iconStartLoading } from 'firefox-profiler/actions/icons';

import { CallNodeDisplayData } from 'firefox-profiler/types';
import { ConnectedProps } from 'firefox-profiler/utils/connect';

import './Icon.css';

type OwnProps =
  | {
      // This prop is used by call tree.
      readonly displayData: CallNodeDisplayData;
    }
  | {
      // This prop is for other parts of the profiler.
      readonly iconUrl: string | null;
    };

type StateProps = {
  readonly className: string;
  readonly icon: string | null;
};

type DispatchProps = {
  readonly iconStartLoading: typeof iconStartLoading;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class IconImpl extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    if (props.icon) {
      props.iconStartLoading(props.icon);
    }
  }

  override componentDidUpdate() {
    if (this.props.icon) {
      this.props.iconStartLoading(this.props.icon);
    }
  }

  override render() {
    return <div className={`nodeIcon ${this.props.className}`} />;
  }
}

export const Icon = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, ownProps) => {
    const icon =
      'displayData' in ownProps
        ? ownProps.displayData.iconSrc
        : ownProps.iconUrl;

    return {
      className: getIconClassName(state, icon),
      icon,
    };
  },
  mapDispatchToProps: { iconStartLoading },
  component: IconImpl,
});
