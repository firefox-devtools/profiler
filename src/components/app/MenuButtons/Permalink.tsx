/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { flushSync } from 'react-dom';
import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';
import * as UrlUtils from 'firefox-profiler/utils/shorten-url';

import './Permalink.css';
import { Localized } from '@fluent/react';

type Props = {
  readonly isNewlyPublished: boolean;
  // This is for injecting a URL shortener for tests. Normally we would use a Jest mock
  // that would mock out a local module, but I was having trouble getting it working
  // correctly (perhaps due to ES6 modules), so I just went with dependency injection
  // instead.
  readonly injectedUrlShortener?: typeof UrlUtils.shortenUrl | void;
};

type State = {
  fullUrl: string;
  shortUrl: string;
};

export class MenuButtonsPermalink extends React.PureComponent<Props, State> {
  _permalinkTextField: HTMLInputElement | null = null;
  _takePermalinkTextFieldRef = (elem: HTMLInputElement | null) => {
    this._permalinkTextField = elem;
  };

  override state: State = {
    fullUrl: '',
    shortUrl: '',
  };

  _shortenUrlAndFocusTextFieldOnCompletion = async (): Promise<void> => {
    const { fullUrl } = this.state;
    const currentFullUrl = window.location.href;
    if (fullUrl !== currentFullUrl) {
      const shortenUrl = this.props.injectedUrlShortener || UrlUtils.shortenUrl;
      try {
        const shortUrl = await shortenUrl(currentFullUrl);
        // Synchronously update the view from this state change, so that the
        // selection works later on.
        flushSync(() => {
          this.setState({ shortUrl, fullUrl: currentFullUrl });
        });
      } catch (error) {
        console.warn('Unable to shorten the URL.', error);
        // Don't remember the fullUrl so that we will attempt to shorten the
        // URL again.
        flushSync(() => {
          this.setState({ shortUrl: currentFullUrl, fullUrl: '' });
        });
      }
    }

    const textField = this._permalinkTextField;
    if (textField) {
      textField.focus();
      textField.select();
    }
  };

  _onPermalinkPanelClose = () => {
    if (this._permalinkTextField) {
      this._permalinkTextField.blur();
    }
  };

  override render() {
    return (
      <Localized id="MenuButtons--permalink--button" attrs={{ label: true }}>
        <ButtonWithPanel
          buttonClassName="menuButtonsButton menuButtonsButton-hasIcon menuButtonsPermalinkButtonButton"
          label="Permalink"
          open={this.props.isNewlyPublished}
          onPanelOpen={this._shortenUrlAndFocusTextFieldOnCompletion}
          onPanelClose={this._onPermalinkPanelClose}
          panelClassName="menuButtonsPermalinkPanel"
          panelContent={
            <input
              data-testid="MenuButtonsPermalink-input"
              type="text"
              className="menuButtonsPermalinkTextField photon-input"
              value={this.state.shortUrl}
              readOnly={true}
              ref={this._takePermalinkTextFieldRef}
            />
          }
        />
      </Localized>
    );
  }
}
