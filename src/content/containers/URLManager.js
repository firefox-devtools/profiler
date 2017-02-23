import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getIsUrlSetupDone } from '../reducers/app';

class URLManager extends Component {
  componentDidMount() {
    const { updateURLState, urlSetupDone, stateFromCurrentLocation, show404 } = this.props;
    if (window.history.state) {
      updateURLState(window.history.state);
    } else {
      try {
        const urlState = stateFromCurrentLocation();
        updateURLState(urlState);
      } catch (e) {
        console.error(e);
        show404(window.location.pathname + window.location.search);
      }
    }
    window.onpopstate = e => {
      updateURLState(e.state);
    };
    urlSetupDone();
  }

  componentWillReceiveProps(nextProps) {
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
  stateFromCurrentLocation: PropTypes.func.isRequired,
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
  isURLSetupDone: getIsUrlSetupDone(state),
}), dispatch => ({
  updateURLState: urlState => dispatch({ type: '@@urlenhancer/updateURLState', urlState }),
  urlSetupDone: () => dispatch({ type: '@@urlenhancer/urlSetupDone' }),
  show404: url => dispatch({ type: 'FILE_NOT_FOUND', url }),
}))(URLManager);
