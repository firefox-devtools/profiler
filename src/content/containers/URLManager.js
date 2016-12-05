import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';

class URLManager extends Component {
  componentDidMount() {
    const { updateURLState, urlSetupDone, stateFromURL, show404 } = this.props;
    if (window.history.state) {
      updateURLState(window.history.state);
    } else {
      try {
        const urlState = stateFromURL(window.location.pathname + window.location.search);
        updateURLState(urlState);
      } catch (e) {
        show404(window.location.pathname + window.location.search);
      }
    }
    window.onpopstate = e => {
      updateURLState(e.state);
    };
    urlSetupDone();
  }

  componentWillReceiveProps(nextProps) {
    const { urlFromState, isUrlSetupDone } = this.props;
    const newURL = urlFromState(nextProps.urlState);
    if (newURL !== window.location.pathname + window.location.search) {
      if (isUrlSetupDone) {
        window.history.pushState(nextProps.urlState, document.title, newURL);
      } else {
        window.history.replaceState(nextProps.urlState, document.title, newURL);
      }
    }
  }

  render() {
    const { isUrlSetupDone } = this.props;
    return isUrlSetupDone ? this.props.children : <div className='processingURL'/>;
  }
}

URLManager.propTypes = {
  stateFromURL: PropTypes.func.isRequired,
  urlFromState: PropTypes.func.isRequired,
  children: PropTypes.any.isRequired,
  urlState: PropTypes.object.isRequired,
  isUrlSetupDone: PropTypes.bool.isRequired,
  updateURLState: PropTypes.func.isRequired,
  urlSetupDone: PropTypes.func.isRequired,
  show404: PropTypes.func.isRequired,
};

export default connect(state => ({
  urlState: state.urlState,
  isUrlSetupDone: state.isUrlSetupDone,
}), dispatch => ({
  updateURLState: urlState => dispatch({ type: '@@urlenhancer/updateURLState', urlState }),
  urlSetupDone: () => dispatch({ type: '@@urlenhancer/urlSetupDone' }),
  show404: url => dispatch({ type: 'FILE_NOT_FOUND', url }),
}))(URLManager);
