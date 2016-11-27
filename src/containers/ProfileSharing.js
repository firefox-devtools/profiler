import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';
import { getProfileViewOptions } from '../selectors/';

const SharingContainer = ({ }) => (
  <div className='profileSharingShareButton'>
    Share...
  </div>
);

const DownloadButton = ({ }) => (
  <div className='profileSharingDownloadButton'>
    Download...
  </div>
)

class ProfileSharing extends Component {
  render() {
    return (
      <div className='profileSharing'>
        <SharingContainer />
        <DownloadButton />
      </div>
    );
  }
}

ProfileSharing.propTypes = {
  viewOptions: PropTypes.object.isRequired,
};

export default connect((state, props) => ({
  viewOptions: getProfileViewOptions(state, props),
}), actions)(ProfileSharing);
