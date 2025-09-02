/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';

import {
  retrieveProfileFromBrowser,
  retrieveProfileFromStore,
  retrieveProfileOrZipFromUrl,
  retrieveProfilesToCompare,
} from 'firefox-profiler/actions/receive-profile';
import {
  getDataSource,
  getHash,
  getProfileUrl,
  getProfilesToCompare,
} from 'firefox-profiler/selectors/url-state';
import { getBrowserConnectionStatus } from 'firefox-profiler/selectors/app';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { DataSource } from 'firefox-profiler/types';
import type { BrowserConnectionStatus } from 'firefox-profiler/app-logic/browser-connection';

type StateProps = {
  readonly dataSource: DataSource;
  readonly hash: string;
  readonly profileUrl: string;
  readonly profilesToCompare: string[] | null;
  readonly browserConnectionStatus: BrowserConnectionStatus;
};

type DispatchProps = {
  readonly retrieveProfileFromBrowser: typeof retrieveProfileFromBrowser;
  readonly retrieveProfileFromStore: typeof retrieveProfileFromStore;
  readonly retrieveProfileOrZipFromUrl: typeof retrieveProfileOrZipFromUrl;
  readonly retrieveProfilesToCompare: typeof retrieveProfilesToCompare;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class ProfileLoaderImpl extends PureComponent<Props> {
  _retrieveProfileFromDataSource = async () => {
    const {
      dataSource,
      browserConnectionStatus,
      hash,
      profileUrl,
      profilesToCompare,
      retrieveProfileFromBrowser,
      retrieveProfileFromStore,
      retrieveProfileOrZipFromUrl,
      retrieveProfilesToCompare,
    } = this.props;
    switch (dataSource) {
      case 'from-browser': {
        retrieveProfileFromBrowser(browserConnectionStatus);
        break;
      }
      case 'from-file':
        // retrieveProfileFromFile should already have been called
        break;
      case 'local':
        break;
      case 'public':
        retrieveProfileFromStore(hash).catch((e) => console.error(e));
        break;
      case 'from-url':
        retrieveProfileOrZipFromUrl(profileUrl).catch((e) => console.error(e));
        break;
      case 'compare':
        if (profilesToCompare) {
          retrieveProfilesToCompare(profilesToCompare);
        }
        break;
      case 'from-post-message':
      case 'uploaded-recordings':
      case 'unpublished':
      case 'none':
        // nothing to do
        /* istanbul ignore next */
        break;
      default:
        throw assertExhaustiveCheck(dataSource);
    }
  };

  override componentDidUpdate(prevProps: Props) {
    if (prevProps.dataSource === 'none' && this.props.dataSource !== 'none') {
      this._retrieveProfileFromDataSource();
    } else if (
      this.props.dataSource === 'compare' &&
      !prevProps.profilesToCompare &&
      this.props.profilesToCompare
    ) {
      this.props.retrieveProfilesToCompare(this.props.profilesToCompare);
    }
  }

  override render() {
    return null;
  }
}

export const ProfileLoader = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    dataSource: getDataSource(state),
    hash: getHash(state),
    profileUrl: getProfileUrl(state),
    profilesToCompare: getProfilesToCompare(state),
    browserConnectionStatus: getBrowserConnectionStatus(state),
  }),
  mapDispatchToProps: {
    retrieveProfileFromStore,
    retrieveProfileOrZipFromUrl,
    retrieveProfileFromBrowser,
    retrieveProfilesToCompare,
  },
  component: ProfileLoaderImpl,
});
