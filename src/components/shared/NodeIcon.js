/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import { getIconClassNameForCallNode } from 'selectors';
import { iconStartLoading } from '../../actions/icons';

import type { CallNodeDisplayData } from '../../types/profile-derived';
import type { ConnectedProps } from '../../utils/connect';

type OwnProps = {|
  +displayData: CallNodeDisplayData,
|};

type StateProps = {|
  +className: string,
  +icon: string | null,
|};

type DispatchProps = {|
  +iconStartLoading: typeof iconStartLoading,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class NodeIcon extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    if (props.icon) {
      props.iconStartLoading(props.icon);
    }
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.icon) {
      nextProps.iconStartLoading(nextProps.icon);
    }
  }

  render() {
    return <div className={`nodeIcon ${this.props.className}`} />;
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, { displayData }) => ({
    className: getIconClassNameForCallNode(state, displayData),
    icon: displayData.icon,
  }),
  mapDispatchToProps: { iconStartLoading },
  component: NodeIcon,
});
