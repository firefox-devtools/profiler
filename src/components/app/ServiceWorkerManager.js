/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import { assertExhaustiveCheck } from '../../utils/flow';

import { getDataSource } from '../../selectors/url-state';
import { getView } from '../../selectors/app';

import type { ConnectedProps } from '../../utils/connect';
import type { DataSource } from '../../types/actions';
import type { Phase } from '../../types/state';

import './ServiceWorkerManager.css';

type StateProps = {|
  +dataSource: DataSource,
  +phase: Phase,
|};
type Props = ConnectedProps<{||}, StateProps, {||}>;

type InstallStatus = 'pending' | 'ready' | 'idle';
type State = {|
  installStatus: InstallStatus,
  isNoticeDisplayed: boolean,
|};

class ServiceWorkerManager extends PureComponent<Props, State> {
  state = {
    installStatus: 'idle',
    isNoticeDisplayed: false,
  };

  _installServiceWorker() {
    const runtime = require('offline-plugin/runtime');
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
          '[ServiceWorker] The new version of the application has been enabled.'
        );
        this.setState({ installStatus: 'ready', isNoticeDisplayed: true });
      },
      onUpdateFailed: () => {
        console.log(
          '[ServiceWorker] We failed to update the application for an unknown reason.'
        );
      },
    });
  }

  componentDidMount() {
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
      this.reloadPage();
    }
  }

  reloadPage() {
    window.location.reload();
  }

  _onCloseNotice = () => {
    this.setState({ isNoticeDisplayed: false });
  };

  render() {
    const { dataSource } = this.props;
    const { installStatus, isNoticeDisplayed } = this.state;

    switch (dataSource) {
      case 'from-file':
      case 'from-addon':
        // We should not propose to reload the page for these data sources,
        // because we'd lose the data.
        return null;
      case 'none':
      case 'public':
      case 'from-url':
      case 'compare':
      case 'local':
        // But for these data sources it should be fine.
        break;
      default:
        throw assertExhaustiveCheck(dataSource);
    }

    if (installStatus !== 'ready') {
      return null;
    }

    if (!isNoticeDisplayed) {
      return null;
    }

    return (
      <div className="serviceworker-ready-notice-wrapper">
        {/* We use the wrapper to horizontally center the notice */}
        <div className="photon-message-bar serviceworker-ready-notice">
          A new version of the application has been downloaded and is ready to
          use.
          <button
            className="photon-button photon-button-micro photon-message-bar-action-button"
            type="button"
            onClick={this.reloadPage}
          >
            Reload the application
          </button>
          <button
            aria-label="Hide the reload notice"
            title="Hide the reload notice"
            className="photon-button photon-message-bar-close-button"
            type="button"
            onClick={this._onCloseNotice}
          />
        </div>
      </div>
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    phase: getView(state).phase,
    dataSource: getDataSource(state),
  }),
  component: ServiceWorkerManager,
});
