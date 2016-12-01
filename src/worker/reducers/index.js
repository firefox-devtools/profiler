import {combineReducers} from 'redux';

function profile(state = null, action) {
  switch (action.type) {
    case 'PROFILE_PROCESSED':
      return action.profile;
    default:
      return state;
  }
}

function summary(state = null, action) {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED':
      return action.summary;
    default:
      return state;
  }
}

export default combineReducers({
  profile,
  summary,
});
