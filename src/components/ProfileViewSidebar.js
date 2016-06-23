import React from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';

export default connect(state => ({
  invertCallstack: state.profileView.viewOptions.invertCallstack,
}), actions)(({ location: { query: { jsOnly } }, changeJSOnly, invertCallstack, changeInvertCallstack }) => (
  <div className='sidebar'>
    <ul>
      <li>
        <label>
          <input type='checkbox'
                 onChange={e => changeJSOnly(e.target.checked)}
                 checked={jsOnly}/>
          { ' JavaScript only' }
        </label>
      </li>
      <li>
        <label>
          <input type='checkbox'
                 onChange={e => changeInvertCallstack(e.target.checked)}
                 checked={invertCallstack}/>
          { ' Invert call stack' }
        </label>
      </li>
    </ul>
  </div>
));
