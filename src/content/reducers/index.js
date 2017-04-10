// @flow
import profileView from './profile-view';
import app from './app';
import summaryView from './summary-view';
import urlState from './url-state';
import flameChart from './flame-chart';
import timelineView from './timeline-view';

const reducer = { app, profileView, summaryView, urlState, flameChart, timelineView };

export default reducer;
