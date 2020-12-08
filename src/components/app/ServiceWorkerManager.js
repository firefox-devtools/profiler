/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import { getDataSource } from 'firefox-profiler/selectors/url-state';
import { getView } from 'firefox-profiler/selectors/app';
import { getSymbolicationStatus } from 'firefox-profiler/selectors/profile';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  DataSource,
  Phase,
  SymbolicationStatus,
} from 'firefox-profiler/types';

import './ServiceWorkerManager.css';

type StateProps = {|
  +dataSource: DataSource,
  +phase: Phase,
  +symbolicationStatus: SymbolicationStatus,
|};
type Props = ConnectedProps<{||}, StateProps, {||}>;

type InstallStatus = 'pending' | 'installing' | 'installed' | 'idle';
type State = {|
  installStatus: InstallStatus,
  isNoticeDisplayed: boolean,
  updatedWhileNotReady: boolean,
|};

/**
 * This component is responsible for installing and updating the service worker,
 * possibly displaying an information notice for the user to switch to the new
 * service worker and reload the page whenever a new version is ready and we're
 * in a state that would accept a reload.
 *
 * Here are some assumptions:
 * - The browser checks for an update (in background) only when registering the
 *   SW, when the webapp starts up. There are other cases where this happens but
 *   this is more rare, especially for us where there's not much network traffic.
 * - By the time we have a symbolicated profile displayed, everything that
 *   should be downloaded is already downloaded.
 *
 * This means that we can force the new service worker at that time: this
 * shouldn't disturb other open tabs that are probably fully loaded already, nor
 * this current tab that is also fully loaded.
 *
 * If we didn't force the new service worker, then, to update, the user would
 * have to close all tabs first. This is not very nice, especially that it's
 * common that our users have several tabs open.
 *
 * We decided to force the new service worker only when the user clicks the
 * reload button. Here is why:
 * - As said above, it's common that our users have several tabs open.
 * - Other tabs will likely be "fully loaded".
 * - Therefore other tabs will trigger the update, even though the current tab
 *   isn't ready.
 * That's why the conscious user action is useful: 1/ this gives an "artisanal"
 * timeout, which could allow the symbolication to finish, and 2/ the user knows
 * something happens and is in control of it.
 *
 * But be wary that this breaks the F5 capability: the user will _have_ to
 * click the button to update (or close all tabs like said above).
 *
 * In the future we could store "processing in progress" profiles in a local
 * indexeddb. Then it would be easy to reload the page in case some module
 * loading fails, and resume the process after the reload.
 */

class ServiceWorkerManagerImpl extends PureComponent<Props, State> {
  state = {
    installStatus: 'idle',
    isNoticeDisplayed: false,
    updatedWhileNotReady: false,
  };

  _installServiceWorker() {
    const runtime = require('offline-plugin/runtime');
    runtime.install({
      onInstalled: () => {
        console.log('[ServiceWorker] App is ready for offline usage!');
      },
      onUpdating: () => {
        // XXX Strangely, this doesn't seem to be called...
        console.log(
          '[ServiceWorker] An update has been found and the browser is downloading the new assets.'
        );
      },
      onUpdateReady: () => {
        console.log(
          '[ServiceWorker] We have downloaded the new assets and we are ready to go.'
        );
        this.setState({
          installStatus: 'pending',
          isNoticeDisplayed: true,
        });
      },
      onUpdated: () => {
        // The update could have been triggered by this tab or another tab.
        // We distinguish these cases by looking at this.state.installStatus.
        console.log(
          '[ServiceWorker] The new version of the application has been enabled.'
        );

        if (this.state.installStatus === 'installing') {
          // In this page the user clicked on the "reload" button.
          this.reloadPage();
          return;
        }

        // In another page, the user clicked on the "reload" button.

        const ready =
          !this._hasDataSourceProfile() || this._isProfileLoadedAndReady();

        this.setState({
          installStatus: 'installed',
          // But if we weren't quite ready, we should write it in the notice.
          updatedWhileNotReady: !ready,
        });
      },
      onUpdateFailed: () => {
        console.log(
          '[ServiceWorker] We failed to update the application for an unknown reason.'
        );
      },
    });
  }

  _hasDataSourceProfile(): boolean {
    const { dataSource } = this.props;

    // We use a switch here, to make sure that when somebody adds a new
    // dataSource, we'll get a flow error if they forget to update here. This is
    // important because it's not obvious which case new datasources will fall
    // into.
    switch (dataSource) {
      case 'none':
      case 'uploaded-recordings':
        return false;
      case 'from-file':
      case 'from-addon':
      case 'unpublished':
      case 'public':
      case 'from-url':
      case 'compare':
      case 'local':
        return true;
      default:
        throw assertExhaustiveCheck(dataSource);
    }
  }

  // This function checks whether the profile is fully loaded.
  _isProfileLoadedAndReady(): boolean {
    const { phase, symbolicationStatus } = this.props;

    if (phase !== ('DATA_LOADED': Phase)) {
      // Note we don't use a switch for the phase because it has a lot of
      // different values and won't likely change often. Hopefully this comment
      // won't age badly.
      return false;
    }

    switch (symbolicationStatus) {
      case 'DONE':
        return true;
      case 'SYMBOLICATING':
        return false;
      default:
        throw assertExhaustiveCheck(symbolicationStatus);
    }
  }

  // This function checks whether we can safely update the service worker,
  // using the state of the running application.
  _canUpdateServiceWorker(): boolean {
    const { dataSource } = this.props;

    // We use a switch here, to make sure that when somebody adds a new
    // dataSource, we'll get a flow error if they forget to update here. This is
    // important because it's not obvious which case new datasources will fall
    // into.
    switch (dataSource) {
      case 'none':
      case 'uploaded-recordings':
        // These datasources have no profile loaded, we can update it right away.
        return true;
      case 'from-file':
      case 'from-addon':
      case 'unpublished':
        // We should not propose to reload the page for these data sources,
        // because we'd lose the data.
        return false;
      case 'public':
      case 'from-url':
      case 'compare':
      case 'local':
        // Before updating the service worker, we need to make sure the profile
        // is ready -- which means we won't need to download anything more.
        return this._isProfileLoadedAndReady();
      default:
        throw assertExhaustiveCheck(dataSource);
    }
  }

  componentDidMount() {
    if (process.env.NODE_ENV === 'production') {
      this._installServiceWorker();
    }
  }

  componentDidUpdate() {
    const { phase, dataSource } = this.props;
    const { installStatus } = this.state;

    if (
      installStatus !== 'idle' &&
      phase === 'FATAL_ERROR' &&
      dataSource !== 'from-file' // we can't reload and keep the context for this dataSource.
    ) {
      // If we got a fatal error and a new version of the application is
      // available, let's try to reload automatically, as this might fix the
      // fatal error.
      const runtime = require('offline-plugin/runtime');
      runtime.applyUpdate();
      this.reloadPage();
    }
  }

  applyServiceWorkerUpdate = () => {
    this.setState({ installStatus: 'installing' });
    const runtime = require('offline-plugin/runtime');
    runtime.applyUpdate();
  };

  reloadPage = () => {
    window.location.reload();
  };

  _onCloseNotice = () => {
    this.setState({ isNoticeDisplayed: false });
  };

  renderButton() {
    const { installStatus } = this.state;

    switch (installStatus) {
      case 'installing':
        return (
          <button
            className="photon-button photon-button-micro photon-message-bar-action-button"
            type="button"
          >
            Installing…
          </button>
        );
      case 'idle':
        throw new Error(
          `We tried to render the notice's button but because we're in status 'idle', there should be no notice.`
        );
      case 'pending':
        return (
          <button
            className="photon-button photon-button-micro photon-message-bar-action-button"
            type="button"
            onClick={this.applyServiceWorkerUpdate}
          >
            Apply and reload
          </button>
        );
      case 'installed':
        // Another tab applied the new service worker.
        return (
          <button
            className="photon-button photon-button-micro photon-message-bar-action-button"
            type="button"
            onClick={this.reloadPage}
          >
            Reload the application
          </button>
        );
      default:
        throw assertExhaustiveCheck(installStatus);
    }
  }

  render() {
    const { isNoticeDisplayed, updatedWhileNotReady } = this.state;

    if (!isNoticeDisplayed) {
      return null;
    }

    if (updatedWhileNotReady) {
      // The user updated the service worker from another tab, before this tab
      // was fully loaded. There may be problems if we need to load some
      // resources, for example the demangling wasm module.
      return (
        <div className="serviceworker-ready-notice-wrapper">
          {/* We use the wrapper to horizontally center the notice */}
          <div className="photon-message-bar photon-message-bar-warning serviceworker-ready-notice">
            <div className="photon-message-bar-inner-content">
              <div className="photon-message-bar-inner-text">
                A new version of the application was applied before this page
                was fully loaded. You might see malfunctions.
              </div>
              {this._canUpdateServiceWorker() ? this.renderButton() : null}
            </div>
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

    if (!this._canUpdateServiceWorker()) {
      // The state in the current tab shows that we're not ready to update.
      return null;
    }

    return (
      <div className="serviceworker-ready-notice-wrapper">
        {/* We use the wrapper to horizontally center the notice */}
        <div className="photon-message-bar serviceworker-ready-notice">
          <div className="photon-message-bar-inner-content">
            <div className="photon-message-bar-inner-text">
              A new version of the application has been downloaded and is ready
              to use.
            </div>
            {this.renderButton()}
          </div>
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

export const ServiceWorkerManager = explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    phase: getView(state).phase,
    dataSource: getDataSource(state),
    symbolicationStatus: getSymbolicationStatus(state),
  }),
  component: ServiceWorkerManagerImpl,
});
