import React, { Component, PropTypes } from 'react';
import { connect, Provider } from 'react-redux';
import { Router, Route, Redirect, IndexRoute } from 'react-router';
import * as actions from '../actions';
import ProfileViewer from '../components/ProfileViewer';
import Home from '../containers/Home';

class GettingProfileFromAddonImpl extends Component {
  componentDidMount() {
    this.props.retrieveProfileFromAddon(this.props.location);
  }

  render() {
    if (window.geckoProfilerPromise) {
      return (
        <div>Retrieving profile from the gecko profiler addon...</div>
      );
    }
    return <p className='profilerNotConnectedErrorMessage'>This tab is not connected to the gecko profiler addon.</p>;
  }
}

GettingProfileFromAddonImpl.propTypes = {
  retrieveProfileFromAddon: PropTypes.func.isRequired,
  location: PropTypes.object.isRequired,
};

const GettingProfileFromAddon = connect(() => ({}), actions)(GettingProfileFromAddonImpl);

const GettingProfileFromLocal = () => (<div>Not implemented yet.</div>);

class GettingProfileFromWebImpl extends Component {
  componentDidMount() {
    const { location, params, retrieveProfileFromWeb } = this.props;
    if (params.hash) {
      retrieveProfileFromWeb(params.hash, location);
    }
  }

  render() {
    const { location, params } = this.props;
    if (params.hash) {
      return (
        <div>Retrieving profile from the public profile store...</div>
      );
    }
    return <FourOhFour location={location}/>;
  }
}

GettingProfileFromWebImpl.propTypes = {
  location: PropTypes.object.isRequired,
  params: PropTypes.object.isRequired,
  retrieveProfileFromWeb: PropTypes.func.isRequired,
};

const GettingProfileFromWeb = connect(() => ({}), actions)(GettingProfileFromWebImpl);

const FourOhFour = ({ location }) => {
  return (
    <div>There is no route handler for the URL {location.pathname}</div>
  );
};

FourOhFour.propTypes = {
  location: PropTypes.object.isRequired,
};

const ProfileViewerWithDataFromAddon = connect(({ view }) => ({ view }))(({ view, location, params }) => {
  switch (view) {
    case 'INITIALIZING':
      return <GettingProfileFromAddon params={params} location={location} />;
    case 'PROFILE':
      return <ProfileViewer dataSource='from-addon' params={params} location={location}/>;
    default:
      return <div>View not found.</div>;
  }
});

const ProfileViewerWithDataFromLocal = connect(({ view }) => ({ view }))(({ view, location, params }) => {
  switch (view) {
    case 'INITIALIZING':
      return <GettingProfileFromLocal params={params} location={location} />;
    case 'PROFILE':
      return <ProfileViewer dataSource='local' params={params} location={location}/>;
    default:
      return <div>View not found.</div>;
  }
});

const ProfileViewerWithDataFromWeb = connect(({ view }) => ({ view }))(({ view, location, params }) => {
  switch (view) {
    case 'INITIALIZING':
      return <GettingProfileFromWeb params={params} location={location} />;
    case 'PROFILE':
      return <ProfileViewer dataSource='public' params={params} location={location}/>;
    default:
      return <div>View not found.</div>;
  }
});

const PassThrough = ({ children }) => children;

export default class Root extends Component {
  render() {
    const { store, history } = this.props;
    return (
      <Provider store={store}>
        <Router history={history}>
          <Route path='/' component={PassThrough}>
            <IndexRoute component={Home} />
            <Route path='from-addon/:selectedTab' component={ProfileViewerWithDataFromAddon} />
            <Redirect from='from-addon' to='/from-addon/calltree/' component={ProfileViewerWithDataFromAddon} />
            <Route path='local/:hash/:selectedTab' component={ProfileViewerWithDataFromLocal} />
            <Redirect from='local/:hash' to='/local/:hash/calltree/' component={ProfileViewerWithDataFromLocal} />
            <Route path='public/:hash/:selectedTab' component={ProfileViewerWithDataFromWeb} />
            <Redirect from='public/:hash' to='/public/:hash/calltree/' component={ProfileViewerWithDataFromWeb} />
            <Route path='*' component={FourOhFour} />
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
