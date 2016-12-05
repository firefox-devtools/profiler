import React from 'react';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileCallTreeSettings from '../components/ProfileCallTreeSettings';
import ProfileCallTreeFilterNavigator from './ProfileCallTreeFilterNavigator';

const ProfileCallTreeView = () => (
  <div className='treeAndSidebarWrapper'>
    <ProfileCallTreeFilterNavigator />
    <ProfileCallTreeSettings />
    <ProfileTreeView/>
  </div>
);

ProfileCallTreeView.propTypes = {
};

export default ProfileCallTreeView;
