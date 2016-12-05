import React, { PropTypes } from 'react';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileCallTreeSettings from '../components/ProfileCallTreeSettings';
import ProfileCallTreeFilterNavigator from './ProfileCallTreeFilterNavigator';

const ProfileCallTreeView = ({ params, location }) => (
  <div className='treeAndSidebarWrapper'>
    <ProfileCallTreeFilterNavigator params={params} location={location} />
    <ProfileCallTreeSettings params={params} location={location} />
    <ProfileTreeView params={params} location={location}/>
  </div>
);

ProfileCallTreeView.propTypes = {
  params: PropTypes.any.isRequired,
  location: PropTypes.any.isRequired,
};

export default ProfileCallTreeView;
