import React, { Component, PropTypes } from 'react';
import { connect, Provider } from 'react-redux';
import { Router, Route, Redirect, IndexRoute } from 'react-router';
import App from './App';
import ProfileViewer from '../components/ProfileViewer';
import Initializing from '../components/Initializing';
import Home from '../containers/Home';

const ProfileViewerOnceReady = connect(({ view }) => ({ view }))(({ view, params, location }) => {
  switch (view) {
    case 'INITIALIZING':
      return (
        <Initializing />
      );
    case 'PROFILE':
      return (
        <ProfileViewer params={params} location={location}/>
      );
    default:
      return (
        <div>View not found.</div>
      );
  }
});

export default class Root extends Component {
  render() {
    const { store, history } = this.props;
    return (
      <Provider store={store}>
        <Router history={history}>
          <Route path='/' component={App}>
            <IndexRoute component={Home} />
            <Route path='profile/:selectedTab' component={ProfileViewerOnceReady} />
            <Redirect from='profile' to='/profile/calltree/' component={ProfileViewerOnceReady} />
          </Route>
        </Router>
      </Provider>
    );
  }
}

Root.propTypes = {
  store: PropTypes.any.isRequired,
  history: PropTypes.any.isRequired,
};
