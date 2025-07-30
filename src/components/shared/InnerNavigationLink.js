/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import { setDataSource } from 'firefox-profiler/actions/profile-view';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import type { DataSource } from 'firefox-profiler/types';

type OwnProps = {
  +className?: string,
  +dataSource: DataSource,
  +children: React.Node,
};

type DispatchProps = {
  +setDataSource: typeof setDataSource,
};

type Props = ConnectedProps<OwnProps, {}, DispatchProps>;

class InnerNavigationLinkImpl extends React.PureComponent<Props> {
  onClick = (e: SyntheticMouseEvent<>) => {
    const { setDataSource, dataSource } = this.props;
    if (e.ctrlKey || e.metaKey) {
      // The user clearly wanted to open this link in a new tab.
      return;
    }

    e.preventDefault();

    setDataSource(dataSource);
  };

  render() {
    const { className, children, dataSource } = this.props;
    const href = dataSource === 'none' ? '/' : `/${dataSource}/`;

    return (
      <a className={className} href={href} onClick={this.onClick}>
        {children}
      </a>
    );
  }
}

export const InnerNavigationLink = explicitConnect<
  OwnProps,
  {},
  DispatchProps,
>({
  mapDispatchToProps: { setDataSource },
  component: InnerNavigationLinkImpl,
});
