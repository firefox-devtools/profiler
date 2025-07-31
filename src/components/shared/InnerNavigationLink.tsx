/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import { setDataSource } from 'firefox-profiler/actions/profile-view';

import explicitConnect, {
  ConnectedProps,
} from 'firefox-profiler/utils/connect';

import { DataSource } from 'firefox-profiler/types/actions';

type OwnProps = {
  readonly className?: string;
  readonly dataSource: DataSource;
  readonly children: React.ReactNode;
};

type DispatchProps = {
  readonly setDataSource: typeof setDataSource;
};

type Props = ConnectedProps<OwnProps, {}, DispatchProps>;

class InnerNavigationLinkImpl extends React.PureComponent<Props> {
  onClick = (e: React.MouseEvent) => {
    const { setDataSource, dataSource } = this.props;
    if (e.ctrlKey || e.metaKey) {
      // The user clearly wanted to open this link in a new tab.
      return;
    }

    e.preventDefault();

    setDataSource(dataSource);
  };

  override render() {
    const { className, children, dataSource } = this.props;
    const href = dataSource === 'none' ? '/' : `/${dataSource}/`;

    return (
      <a className={className} href={href} onClick={this.onClick}>
        {children}
      </a>
    );
  }
}

export const InnerNavigationLink = explicitConnect<OwnProps, {}, DispatchProps>(
  {
    mapDispatchToProps: { setDataSource },
    component: InnerNavigationLinkImpl,
  }
);
