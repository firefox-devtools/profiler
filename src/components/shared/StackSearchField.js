/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import classNames from 'classnames';
import IdleSearchField from './IdleSearchField';
import { changeCallTreeSearchString } from '../../actions/profile-view';
import { getCurrentSearchString } from '../../selectors/url-state';

import type { ConnectedProps } from '../../utils/connect';

import './StackSearchField.css';

type OwnProps = {|
  +className: string,
|};

type StateProps = {|
  +currentSearchString: string,
|};

type DispatchProps = {|
  +changeCallTreeSearchString: typeof changeCallTreeSearchString,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {| searchFieldFocused: boolean |};

class StackSearchField extends React.PureComponent<Props, State> {
  state = { searchFieldFocused: false };
  _onSearchFieldIdleAfterChange = (value: string) => {
    this.props.changeCallTreeSearchString(value);
  };

  _onSearchFieldFocus = () => {
    this.setState({ searchFieldFocused: true });
  };

  _onSearchFieldBlur = () => {
    this.setState(() => ({ searchFieldFocused: false }));
  };

  render() {
    const { currentSearchString, className } = this.props;
    const { searchFieldFocused } = this.state;
    const showIntroduction =
      searchFieldFocused &&
      currentSearchString &&
      !currentSearchString.includes(',');
    return (
      <div className={classNames('stackSearchField', className)}>
        <label className="stackSearchFieldLabel">
          {'Filter stacks: '}
          <IdleSearchField
            className="stackSearchFieldInput"
            title="Only display stacks which contain a function whose name matches this substring"
            idlePeriod={200}
            defaultValue={currentSearchString}
            onIdleAfterChange={this._onSearchFieldIdleAfterChange}
            onBlur={this._onSearchFieldBlur}
            onFocus={this._onSearchFieldFocus}
          />
          <div
            className={classNames('stackSearchFieldIntroduction', {
              isHidden: !showIntroduction,
              isDisplayed: showIntroduction,
            })}
          >
            Did you know you can use the comma (,) to search using several
            terms?
          </div>
        </label>
      </div>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    currentSearchString: getCurrentSearchString(state),
  }),
  mapDispatchToProps: { changeCallTreeSearchString },
  component: StackSearchField,
});
