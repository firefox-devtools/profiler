/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getIsUrlSetupDone } from '../../reducers/app';

import type { Dispatch } from '../../types/store';

type Props = {
  stateFromLocation: Location => any,
  urlFromState: any => string,
  children: any,
  urlState: any,
  isUrlSetupDone: boolean,
  updateUrlState: string => void,
  urlSetupDone: void => void,
  show404: string => void,
};

class UrlManager extends PureComponent<Props> {
  _updateState() {
    const { updateUrlState, stateFromLocation, show404 } = this.props;
    if (window.history.state) {
      updateUrlState(window.history.state);
    } else {
      try {
        const urlState = stateFromLocation(window.location);
        updateUrlState(urlState);
      } catch (e) {
        console.error(e);
        show404(window.location.pathname + window.location.search);
      }
    }
  }
  componentDidMount() {
    const { urlSetupDone } = this.props;

    this._updateState();
    window.addEventListener('popstate', () => this._updateState());
    urlSetupDone();
  }

  componentWillReceiveProps(nextProps: Props) {
    const { urlFromState, isUrlSetupDone } = this.props;
    const newUrl = urlFromState(nextProps.urlState);
    if (newUrl !== window.location.pathname + window.location.search) {
      if (isUrlSetupDone) {
        window.history.pushState(nextProps.urlState, document.title, newUrl);
      } else {
        window.history.replaceState(nextProps.urlState, document.title, newUrl);
      }
    }
  }

  render() {
    const { isUrlSetupDone } = this.props;
    return isUrlSetupDone
      ? this.props.children
      : <div className="processingUrl" />;
  }
}

UrlManager.propTypes = {
  stateFromLocation: PropTypes.func.isRequired,
  urlFromState: PropTypes.func.isRequired,
  children: PropTypes.any.isRequired,
  urlState: PropTypes.object.isRequired,
  isUrlSetupDone: PropTypes.bool.isRequired,
  updateUrlState: PropTypes.func.isRequired,
  urlSetupDone: PropTypes.func.isRequired,
  show404: PropTypes.func.isRequired,
};

export default connect(
  state => ({
    urlState: state.urlState,
    isUrlSetupDone: getIsUrlSetupDone(state),
  }),
  (dispatch: Dispatch) => ({
    updateUrlState: urlState =>
      dispatch({ type: '@@urlenhancer/updateUrlState', urlState }),
    urlSetupDone: () => dispatch({ type: '@@urlenhancer/urlSetupDone' }),
    show404: url => dispatch({ type: 'ROUTE_NOT_FOUND', url }),
  })
)(UrlManager);
