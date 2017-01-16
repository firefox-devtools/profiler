import {combineReducers} from 'redux';
import profile from './profile';
import summary from './summary';

export default combineReducers({
  profile,
  summary,
});
