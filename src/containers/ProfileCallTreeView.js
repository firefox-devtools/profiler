import React, { PropTypes } from 'react';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileCallTreeSidebar from '../components/ProfileCallTreeSidebar';

const ProfileCallTreeView = ({ params, location }) => (
  <div className='treeAndSidebarWrapper'>
    <ProfileTreeView params={params} location={location}/>
    <ProfileCallTreeSidebar params={params} location={location} />
  </div>
);

ProfileCallTreeView.propTypes = {
  params: PropTypes.any.isRequired,
  location: PropTypes.any.isRequired,
};

export default ProfileCallTreeView;
