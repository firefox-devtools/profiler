/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { changeShowJsTracerSummary } from 'firefox-profiler/actions/profile-view';
import { getShowJsTracerSummary } from 'firefox-profiler/selectors/url-state';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import './Settings.css';
import { Localized } from '@fluent/react';

type StateProps = {
  readonly showJsTracerSummary: boolean,
};

type DispatchProps = {
  readonly changeShowJsTracerSummary: typeof changeShowJsTracerSummary,
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class JsTracerSettingsImpl extends PureComponent<Props> {
  _onCheckboxChange = () => {
    this.props.changeShowJsTracerSummary(!this.props.showJsTracerSummary);
  };

  render() {
    const { showJsTracerSummary } = this.props;
    return (
      <div className="jsTracerSettings">
        <ul className="jsTracerSettingsList">
          <li className="jsTracerSettingsListItem">
            <label className="jsTracerSettingsLabel">
              <input
                type="checkbox"
                className="jsTracerSettingsCheckbox"
                onChange={this._onCheckboxChange}
                checked={showJsTracerSummary}
              />
              <Localized
                id="JsTracerSettings--show-only-self-time"
                attrs={{ title: true }}
              >
                <span>Show only self time</span>
              </Localized>
            </label>
          </li>
        </ul>
      </div>
    );
  }
}

export const JsTracerSettings = explicitConnect<
  {},
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state) => ({
    showJsTracerSummary: getShowJsTracerSummary(state),
  }),
  mapDispatchToProps: {
    changeShowJsTracerSummary,
  },
  component: JsTracerSettingsImpl,
});
