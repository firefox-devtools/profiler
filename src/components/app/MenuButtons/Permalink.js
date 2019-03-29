/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import ArrowPanel from '../../shared/ArrowPanel';
import ButtonWithPanel from '../../shared/ButtonWithPanel';
import { shortenUrl } from '../../../utils/shorten-url';

type State = {|
  fullUrl: string,
  shortUrl: string,
|};

export class MenuButtonsPermalink extends React.PureComponent<*, State> {
  _permalinkButton: ButtonWithPanel | null;
  _permalinkTextField: HTMLInputElement | null;
  _takePermalinkButtonRef = (elem: any) => {
    this._permalinkButton = elem;
  };
  _takePermalinkTextFieldRef = (elem: any) => {
    this._permalinkTextField = elem;
  };

  state = {
    fullUrl: '',
    shortUrl: '',
  };

  _shortenUrlAndFocusTextFieldOnCompletion = async (): Promise<void> => {
    const { fullUrl } = this.state;
    const currentFullUrl = window.location.href;
    if (fullUrl !== currentFullUrl) {
      try {
        const shortUrl = await shortenUrl(currentFullUrl);
        this.setState({ shortUrl, fullUrl: currentFullUrl });
      } catch (error) {
        console.warn('Unable to shorten the URL.', error);
        // Don't remember the fullUrl so that we will attempt to shorten the
        // URL again.
        this.setState({ shortUrl: currentFullUrl, fullUrl: '' });
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

  render() {
    return (
      <ButtonWithPanel
        className="menuButtonsPermalinkButton"
        ref={this._takePermalinkButtonRef}
        label="Permalink"
        panel={
          <ArrowPanel
            className="menuButtonsPermalinkPanel"
            onOpen={this._shortenUrlAndFocusTextFieldOnCompletion}
            onClose={this._onPermalinkPanelClose}
          >
            <input
              type="text"
              className="menuButtonsPermalinkTextField photon-input"
              value={this.state.shortUrl}
              readOnly="readOnly"
              ref={this._takePermalinkTextFieldRef}
            />
          </ArrowPanel>
        }
      />
    );
  }
}
