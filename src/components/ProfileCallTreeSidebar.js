import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';
import { getJSOnly, getInvertCallstack } from '../selectors';

import './ProfileCallTreeSidebar.css';

class ProfileCallTreeSidebar extends Component {
  constructor(props) {
    super(props);
    this._onJSOnlyClick = this._onJSOnlyClick.bind(this);
    this._onInvertCallstackClick = this._onInvertCallstackClick.bind(this);
  }

  _onJSOnlyClick(e) {
    this.props.changeJSOnly(e.target.checked, this.props.location);
  }

  _onInvertCallstackClick(e) {
    this.props.changeInvertCallstack(e.target.checked, this.props.location);
  }

  render() {
    const { jsOnly, invertCallstack } = this.props;
    return (
      <div className='sidebar'>
        <ul>
          <li>
            <label>
              <input type='checkbox'
                     onChange={this._onJSOnlyClick}
                     checked={jsOnly}/>
              { ' JavaScript only' }
            </label>
          </li>
          <li>
            <label>
              <input type='checkbox'
                     onChange={this._onInvertCallstackClick}
                     checked={invertCallstack}/>
              { ' Invert call stack' }
            </label>
          </li>
        </ul>
      </div>
    );
  }
}

ProfileCallTreeSidebar.propTypes = {
  jsOnly: PropTypes.bool.isRequired,
  changeJSOnly: PropTypes.func.isRequired,
  invertCallstack: PropTypes.bool.isRequired,
  changeInvertCallstack: PropTypes.func.isRequired,
  location: PropTypes.any.isRequired,
};

export default connect((state, props) => ({
  invertCallstack: getInvertCallstack(state, props),
  jsOnly: getJSOnly(state, props),
}), actions)(ProfileCallTreeSidebar);
