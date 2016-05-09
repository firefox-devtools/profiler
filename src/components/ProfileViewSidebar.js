import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import shallowequal from 'shallowequal';
import * as Actions from '../actions';

const ProfileViewSidebar = ({ jsOnly, onChangeJSOnly }) => (
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
    </ul>
  </div>
);


export default connect(state => ({
  jsOnly: state.profileView.viewOptions.jsOnly
}), dispatch => ({
  onChangeJSOnly: jsOnly => dispatch(Actions.changeJSOnly(jsOnly)),
}))(ProfileViewSidebar);
