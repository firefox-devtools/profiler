/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import { Workbox } from 'workbox-window';

import { isLocalURL } from 'firefox-profiler/utils/url';
import explicitConnect from 'firefox-profiler/utils/connect';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import {
  getDataSource,
  getProfileUrl,
} from 'firefox-profiler/selectors/url-state';
import { getView } from 'firefox-profiler/selectors/app';
import { getSymbolicationStatus } from 'firefox-profiler/selectors/profile';
import type {
  State as AppState,
  DataSource,
  Phase,
  SymbolicationStatus,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './ServiceWorkerManager.css';

type StateProps = {
  readonly dataSource: DataSource;
  readonly profileUrl: string;
  readonly phase: Phase;
  readonly symbolicationStatus: SymbolicationStatus;
};
type Props = ConnectedProps<{}, StateProps, {}>;

type InstallStatus = 'pending' | 'activating' | 'controlling' | 'idle';
type State = {
  installStatus: InstallStatus;
  isNoticeDisplayed: boolean;
  updatedWhileNotReady: boolean;
};

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
  override state: State = {
    installStatus: 'idle',
    isNoticeDisplayed: false,
    updatedWhileNotReady: false,
  };

  _workbox: Workbox | null = null;

  _installServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    const wb = (this._workbox = new Workbox('/sw.js', {
      // With this option, all scripts, including imported scripts, will be
      // requested bypassing HTTP cache, to determine if an update is needed.
      // The default is to bypass cache only for the serviceworker script but
      // otherwise use the cache for the imported scripts, this property changes
      // this behavior. We do this so that we can simply copy the imported file
      // service-worker-compat.js without adding a hash to the file name.
      // For more information and background, see:
      // - discussion in https://github.com/w3c/ServiceWorker/issues/106
      // - chrome update in https://developer.chrome.com/blog/fresher-sw/
      // - step 8.21 in https://w3c.github.io/ServiceWorker/#update-algorithm
      updateViaCache: 'none',
    }));
    wb.register();

    wb.addEventListener('installing', () => {
      console.log(
        '[ServiceWorker] An update has been found and the browser is downloading the new assets.'
      );
    });

    wb.addEventListener('installed', () => {
      // We cached all assets.
      console.log('[ServiceWorker] App is ready for offline usage!');
    });

    wb.addEventListener('waiting', () => {
      // Update is ready to be applied.
      console.log(
        '[ServiceWorker] We have downloaded the new assets and we are ready to go.'
      );
      this.setState({
        installStatus: 'pending',
        isNoticeDisplayed: true,
      });
    });

    wb.addEventListener('controlling', () => {
      // The update could have been triggered by this tab or another tab.
      // We distinguish these cases by looking at this.state.installStatus.
      console.log(
        '[ServiceWorker] The new version of the application has started handling the fetch requests.'
      );

      if (this.state.installStatus === 'activating') {
        // In this page the user clicked on the "Apply and reload" button.
        this.reloadPage();
        return;
      }

      // In another page, the user clicked on the "Apply and reload" button.

      const ready =
        !this._hasDataSourceProfile() || this._isProfileLoadedAndReady();

      this.setState({
        installStatus: 'controlling',
        // But if we weren't quite ready, we should write it in the notice.
        updatedWhileNotReady: !ready,
      });
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
      case 'from-browser':
      case 'from-post-message':
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

    if (phase !== 'DATA_LOADED') {
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
    const { dataSource, profileUrl } = this.props;

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
      case 'from-browser':
      case 'from-post-message':
      case 'unpublished':
        // We should not propose to reload the page for these data sources,
        // because we'd lose the data.
        return false;
      case 'from-url':
        // If loaded from localhost, don't propose to reload the page as the
        // server may no longer be running:
        if (isLocalURL(profileUrl)) {
          return false;
        }
      // otherwise, fall through.
      case 'public':
      case 'compare':
      case 'local':
        // Before updating the service worker, we need to make sure the profile
        // is ready -- which means we won't need to download anything more.
        return this._isProfileLoadedAndReady();
      default:
        throw assertExhaustiveCheck(dataSource);
    }
  }

  override componentDidMount() {
    if (
      process.env.NODE_ENV === 'production' &&
      // Do not install the service worker for l10n branch so localizers can see
      // the changes easily with a single refresh. This variable is added by
      // webpack's DefinePlugin.
      !AVAILABLE_STAGING_LOCALES
    ) {
      this._installServiceWorker();
    }
  }

  override componentDidUpdate() {
    const { phase, dataSource } = this.props;
    const { installStatus } = this.state;

    if (
      this._workbox &&
      installStatus !== 'idle' &&
      phase === 'FATAL_ERROR' &&
      dataSource !== 'from-file' // we can't reload and keep the context for this dataSource.
    ) {
      // If we got a fatal error and a new version of the application is
      // available, let's try to reload automatically, as this might fix the
      // fatal error.
      this._workbox.messageSkipWaiting();
      this.reloadPage();
    }
  }

  applyServiceWorkerUpdate = () => {
    const wb = this._workbox;
    if (wb) {
      this.setState({ installStatus: 'activating' });
      wb.messageSkipWaiting();
    }
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
      case 'activating':
        return (
          <Localized id="ServiceWorkerManager--applying-button">
            <button
              className="photon-button photon-button-micro photon-message-bar-action-button"
              type="button"
            >
              Applying…
            </button>
          </Localized>
        );
      case 'idle':
        throw new Error(
          `We tried to render the notice's button but because we're in status 'idle', there should be no notice.`
        );
      case 'pending':
        return (
          <Localized id="ServiceWorkerManager--pending-button">
            <button
              className="photon-button photon-button-micro photon-message-bar-action-button"
              type="button"
              onClick={this.applyServiceWorkerUpdate}
            >
              Apply and reload
            </button>
          </Localized>
        );
      case 'controlling':
        // Another tab applied the new service worker.
        return (
          <Localized id="ServiceWorkerManager--installed-button">
            <button
              className="photon-button photon-button-micro photon-message-bar-action-button"
              type="button"
              onClick={this.reloadPage}
            >
              Reload the application
            </button>
          </Localized>
        );
      default:
        throw assertExhaustiveCheck(installStatus as never);
    }
  }

  override render() {
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
                <Localized id="ServiceWorkerManager--updated-while-not-ready">
                  A new version of the application was applied before this page
                  was fully loaded. You might see malfunctions.
                </Localized>
              </div>
              {this._canUpdateServiceWorker() ? this.renderButton() : null}
            </div>
            <Localized
              id="ServiceWorkerManager--hide-notice-button"
              attrs={{ 'aria-label': true, title: true }}
            >
              <button
                aria-label="Hide the reload notice"
                title="Hide the reload notice"
                className="photon-button photon-message-bar-close-button"
                type="button"
                onClick={this._onCloseNotice}
              />
            </Localized>
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
              <Localized id="ServiceWorkerManager--new-version-is-ready">
                A new version of the application has been downloaded and is
                ready to use.
              </Localized>
            </div>
            {this.renderButton()}
          </div>
          <Localized
            id="ServiceWorkerManager--hide-notice-button"
            attrs={{ 'aria-label': true, title: true }}
          >
            <button
              aria-label="Hide the reload notice"
              title="Hide the reload notice"
              className="photon-button photon-message-bar-close-button"
              type="button"
              onClick={this._onCloseNotice}
            />
          </Localized>
        </div>
      </div>
    );
  }
}

export const ServiceWorkerManager = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state: AppState) => ({
    phase: getView(state).phase,
    dataSource: getDataSource(state),
    profileUrl: getProfileUrl(state),
    symbolicationStatus: getSymbolicationStatus(state),
  }),
  component: ServiceWorkerManagerImpl,
});
