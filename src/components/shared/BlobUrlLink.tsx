/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

type Props = {
  // Do not make these props exact, the extra props are passed to the anchor element.
  readonly blob: Blob;
  readonly children: React.ReactNode;
};

type State = {
  url: string;
  prevBlob: Blob | null;
};

/**
 * This component is responsible for converting a Blob into an
 * ObjectUrl. The ObjectUrl strings are not GCed, so this component
 * does the proper thing of cleaning up after itself as the component
 * is mounted, updated, and unmounted.
 */
export class BlobUrlLink extends React.PureComponent<Props, State> {
  override state: State = {
    url: '',
    prevBlob: null,
  };

  static getDerivedStateFromProps(props: Props, state: State) {
    if (props.blob === state.prevBlob) {
      return null;
    }
    if (state.prevBlob) {
      URL.revokeObjectURL(state.url);
    }
    return {
      url: URL.createObjectURL(props.blob),
      prevBlob: props.blob,
    };
  }

  override componentWillUnmount() {
    URL.revokeObjectURL(this.state.url);
  }

  override render() {
    const {
      blob,
      children,
      ...rest
    } = this.props;

    // This component must be an <a> rather than a <button> as the download attribute
    // allows users to download the profile.
    return (
      <a href={this.state.url} {...rest}>
        {children}
      </a>
    );
  }
}
