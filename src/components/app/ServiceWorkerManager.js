/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { getDataSource } from '../../reducers/url-state';
import { getView } from '../../reducers/app';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { DataSource } from '../../types/actions';
import type { Phase } from '../../types/reducers';

type StateProps = {|
  +dataSource: DataSource,
  +phase: Phase,
|};
type Props = ConnectedProps<{||}, StateProps, {||}>;

type InstallStatus = 'pending' | 'ready' | 'idle';
type State = {|
  installStatus: InstallStatus,
|};

class ServiceWorkerManager extends PureComponent<Props, State> {
  state = { installStatus: 'idle' };

  _installServiceWorker() {
    // We use '@mstange/offline-plugin/runtime' here instead of
    // 'offline-plugin/runtime' because the fork contains the fix from
    // https://github.com/NekR/offline-plugin/pull/410
    const runtime = require('@mstange/offline-plugin/runtime');
    runtime.install({
      onInstalled: () => {
        console.log('[ServiceWorker] App is ready for offline usage!');
      },
      onUpdating: () => {
        console.log(
          '[ServiceWorker] An update has been found and the browser is downloading the new assets.'
        );
      },
      onUpdateReady: () => {
        console.log(
          '[ServiceWorker] We have downloaded the new assets and we are ready to go.'
        );
        runtime.applyUpdate();
        this.setState({ installStatus: 'pending' });
      },
      onUpdated: () => {
        console.log(
          '[ServiceWorker] The new version of the service worker has been enabled.'
        );
        this.setState({ installStatus: 'ready' });
      },
      onUpdateFailed: () => {
        console.log(
          '[ServiceWorker] We failed to update the service worker for an unknown reason.'
        );
      },
    });
  }

  componentWillMount() {
    if (process.env.NODE_ENV === 'production') {
      this._installServiceWorker();
    }
  }

  componentDidUpdate() {
    const { phase } = this.props;
    const { installStatus } = this.state;

    if (phase !== 'FATAL_ERROR') {
      return;
    }

    if (installStatus === 'ready') {
      window.location.reload();
    }
  }

  render() {
    const { dataSource } = this.props;
    const { installStatus } = this.state;

    if (dataSource !== 'none' && dataSource === 'public') {
      return null;
    }

    if (installStatus !== 'ready') {
      return null;
    }

    return (
      <div className="serviceworker-ready-notice">
        An update is ready, if you want to use it now you can
        <a href="javascript:location.reload()">
          click here to reload the page
        </a>.
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    phase: getView(state).phase,
    dataSource: getDataSource(state),
  }),
  component: ServiceWorkerManager,
};
export default explicitConnect(options);
