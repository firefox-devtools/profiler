// @flow
import * as app from './app';
import * as profileSummary from './profile-summary';
import * as profileView from './profile-view';
import * as receiveProfile from './receive-profile';
import * as timeline from './timeline';

export default Object.assign({}, app, profileSummary, profileView, receiveProfile, timeline);
