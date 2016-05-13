import React, { PropTypes } from 'react';
import { connect } from 'react-redux';
import * as Actions from '../actions';

const ProfileViewSidebar = ({ jsOnly, onChangeJSOnly, invertCallstack, onChangeInvertCallstack }) => (
  <div className='sidebar'>
    <ul>
      <li>
        <label>
          <input type='checkbox'
                 onChange={e => onChangeJSOnly(e.target.checked)}
                 checked={jsOnly}/>
          { ' JavaScript only' }
        </label>
      </li>
      <li>
        <label>
          <input type='checkbox'
                 onChange={e => onChangeInvertCallstack(e.target.checked)}
                 checked={invertCallstack}/>
          { ' Invert call stack' }
        </label>
      </li>
    </ul>
  </div>
);

ProfileViewSidebar.propTypes = {
  jsOnly: PropTypes.bool.isRequired,
  onChangeJSOnly: PropTypes.func.isRequired,
  invertCallstack: PropTypes.bool.isRequired,
  onChangeInvertCallstack: PropTypes.func.isRequired,
};

export default connect(state => ({
  jsOnly: state.profileView.viewOptions.jsOnly,
  invertCallstack: state.profileView.viewOptions.invertCallstack,
}), dispatch => ({
  onChangeJSOnly: jsOnly => dispatch(Actions.changeJSOnly(jsOnly)),
  onChangeInvertCallstack: invertCallstack => dispatch(Actions.changeInvertCallstack(invertCallstack)),
}))(ProfileViewSidebar);
