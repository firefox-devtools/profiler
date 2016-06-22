import React, { Component, PropTypes } from 'react';
import { Provider } from 'react-redux';
import { Router, Route } from 'react-router';
import App from './App';

export default class Root extends Component {
  render() {
    const { store, history } = this.props;
    return (
      <Provider store={store}>
        <Router history={history}>
          <Route path='/' component={App} />
        </Router>
      </Provider>
    );
  }
}

Root.propTypes = {
  store: PropTypes.any.isRequired,
  history: PropTypes.any.isRequired,
};
