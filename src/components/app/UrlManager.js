/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import PropTypes from 'prop-types';
import explicitConnect from '../../utils/connect';
import { getIsUrlSetupDone } from '../../reducers/app';
import { updateUrlState, urlSetupDone, show404 } from '../../actions/app';
import { urlFromState, stateFromLocation } from '../../url-handling';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { UrlState } from '../../types/reducers';

type StateProps = {|
  +urlState: UrlState,
  +isUrlSetupDone: boolean,
|};

type DispatchProps = {|
  +updateUrlState: typeof updateUrlState,
  +urlSetupDone: typeof urlSetupDone,
  +show404: typeof show404,
|};

type OwnProps = {|
  +children: React.Node,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class UrlManager extends React.PureComponent<Props> {
  _updateState() {
    const { updateUrlState, show404 } = this.props;
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
    this._updateState();
    window.addEventListener('popstate', () => this._updateState());
    this.props.urlSetupDone();
  }

  componentWillReceiveProps(nextProps: Props) {
    const { isUrlSetupDone } = this.props;
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
  children: PropTypes.any.isRequired,
  urlState: PropTypes.object.isRequired,
  isUrlSetupDone: PropTypes.bool.isRequired,
  updateUrlState: PropTypes.func.isRequired,
  urlSetupDone: PropTypes.func.isRequired,
  show404: PropTypes.func.isRequired,
};

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    urlState: state.urlState,
    isUrlSetupDone: getIsUrlSetupDone(state),
  }),
  mapDispatchToProps: {
    updateUrlState,
    urlSetupDone,
    show404,
  },
  component: UrlManager,
};

export default explicitConnect(options);
