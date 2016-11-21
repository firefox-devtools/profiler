import React, { Component } from 'react';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileViewSidebar from '../components/ProfileViewSidebar';

export default ({ params, location }) => (
  <div className='treeAndSidebarWrapper'>
    <ProfileViewSidebar params={params} location={location} />
    <ProfileTreeView params={params} location={location}/>
  </div>
);
