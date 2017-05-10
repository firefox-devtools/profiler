/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import actions from '../actions';

class ProfileUploadField extends PureComponent {
  constructor(props) {
    super(props);
    this._onInputChange = this._onInputChange.bind(this);
  }

  _onInputChange(e) {
    const files = e.target.files;
    if (files.length > 0) {
      console.log(files);
      console.log(files[0]);
      const reader = new FileReader();
      console.log(reader.readAsText(files[0]));
      this.props.retrieveProfileFromFile(files[0]);
    }
  }

  render() {
    return (
      <input type='file' onChange={this._onInputChange}/>
    );
  }
}

ProfileUploadField.propTypes = {
  retrieveProfileFromFile: PropTypes.func.isRequired,
};

export default connect(() => ({}), actions)(ProfileUploadField);
