/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getIsURLSetupDone } from '../reducers/app';

import type { Dispatch } from '../actions/types.js';

type Props = {
  stateFromLocation: Location => any,
  urlFromState: any => string,
  children: any,
  urlState: any,
  isURLSetupDone: boolean,
  updateURLState: string => void,
  urlSetupDone: void => void,
  show404: string => void,
};

class URLManager extends PureComponent {
  props: Props;

  _updateState() {
    const { updateURLState, stateFromLocation, show404 } = this.props;
    if (window.history.state) {
      updateURLState(window.history.state);
    } else {
      try {
        const urlState = stateFromLocation(window.location);
        updateURLState(urlState);
      } catch (e) {
        console.error(e);
        show404(window.location.pathname + window.location.search);
      }
    }
  }
  componentDidMount() {
    const { urlSetupDone } = this.props;

    this._updateState();
    window.onpopstate = () => this._updateState();
    urlSetupDone();
  }

  componentWillReceiveProps(nextProps: Props) {
    const { urlFromState, isURLSetupDone } = this.props;
    const newURL = urlFromState(nextProps.urlState);
    if (newURL !== window.location.pathname + window.location.search) {
      if (isURLSetupDone) {
        window.history.pushState(nextProps.urlState, document.title, newURL);
      } else {
        window.history.replaceState(nextProps.urlState, document.title, newURL);
      }
    }
  }

  render() {
    const { isURLSetupDone } = this.props;
    return isURLSetupDone ? this.props.children : <div className='processingURL'/>;
  }
}

URLManager.propTypes = {
  stateFromLocation: PropTypes.func.isRequired,
  urlFromState: PropTypes.func.isRequired,
  children: PropTypes.any.isRequired,
  urlState: PropTypes.object.isRequired,
  isURLSetupDone: PropTypes.bool.isRequired,
  updateURLState: PropTypes.func.isRequired,
  urlSetupDone: PropTypes.func.isRequired,
  show404: PropTypes.func.isRequired,
};

export default connect(state => ({
  urlState: state.urlState,
  isURLSetupDone: getIsURLSetupDone(state),
}), (dispatch: Dispatch) => ({
  updateURLState: urlState => dispatch({ type: '@@urlenhancer/updateURLState', urlState }),
  urlSetupDone: () => dispatch({ type: '@@urlenhancer/urlSetupDone' }),
  show404: url => dispatch({ type: 'ROUTE_NOT_FOUND', url }),
}))(URLManager);
