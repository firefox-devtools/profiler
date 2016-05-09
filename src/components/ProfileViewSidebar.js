import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
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


export default connect(state => ({
  jsOnly: state.profileView.viewOptions.jsOnly,
  invertCallstack: state.profileView.viewOptions.invertCallstack,
}), dispatch => ({
  onChangeJSOnly: jsOnly => dispatch(Actions.changeJSOnly(jsOnly)),
  onChangeInvertCallstack: invertCallstack => dispatch(Actions.changeInvertCallstack(invertCallstack)),
}))(ProfileViewSidebar);
