import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { getProfile } from '../selectors/';
import { gzipString } from '../gz';
import { uploadBinaryProfileData } from '../cleopatra-profile-store';
import ArrowPanel from '../components/ArrowPanel';
import ButtonWithPanel from '../components/ButtonWithPanel';

require('./ProfileSharing.css');

const PrivacyNotice = () => (
  <section className='privacyNotice'>
    <p>{
      `You’re about to upload your profile publicly where anyone will be able to access it.
      To better diagnose performance problems profiles include the following information:`
    }</p>
    <ul>
      <li>{'The URLs and scripts of the tabs that were executing.'}</li>
      <li>{'The metadata of all your add-ons to identify slow add-ons.'}</li>
      <li>{'Firefox build and runtime configuration.'}</li>
    </ul>
    <p>{
      `To view all the information you can download the full profile to a file and open the
      json structure with a text editor.`
    }</p>
  </section>
);

const UploadingStatus = ({ progress }) => (
  <div className='profileSharingUploadingButton'>
    <div className='profileSharingUploadingButtonInner'>
      <progress className='profileSharingUploadingButtonProgress' value={progress}/>
      <div className='profileSharingUploadingButtonLabel'>Uploading...</div>
    </div>
  </div>
);

UploadingStatus.propTypes = {
  progress: PropTypes.number.isRequired,
};

class ProfileSharingCompositeButtonImpl extends Component {
  constructor(props) {
    super(props);
    this.state = {
      state: 'local',  // local -> uploading (<-> error) -> public
      uploadProgress: 0,
      key: '',
      error: '',
    };
    this._attemptToShare = this._attemptToShare.bind(this);
    this._permalinkButtonCreated = elem => { this._permalinkButton = elem; };
    this._uploadErrorButtonCreated = elem => { this._uploadErrorButton = elem; };
  }

  _attemptToShare() {
    if (this.state.state !== 'local' &&
        this.state.state !== 'error') {
      return;
    }

    (new Promise(resolve => {
      const { profile } = this.props;
      if (!profile) {
        throw new Error('profile is null');
      }
      const jsonString = JSON.stringify(profile);
      if (!jsonString) {
        throw new Error('profile stringification failed');
      }

      this.setState({ state: 'uploading' });
      resolve(jsonString);
    })).then(gzipString).then(gzipData => {
      return uploadBinaryProfileData(gzipData, uploadProgress => {
        this.setState({ uploadProgress });
      });
    }).then(key => {
      this.setState({
        state: 'public',
        key,
      });
      if (this._permalinkButton) {
        this._permalinkButton.openPanel();
      }
    }).catch(error => {
      this.setState({
        state: 'error',
        error,
      });
      if (this._uploadErrorButton) {
        this._uploadErrorButton.openPanel();
      }
    });
  }

  render() {
    const { state, uploadProgress, /* key, */ error } = this.state;
    return (
      <div className={
        classNames('profileSharingCompositeButtonContainer', {
          'currentButtonIsShareButton': state === 'local',
          'currentButtonIsUploadingButton': state === 'uploading',
          'currentButtonIsPermalinkButton': state === 'public',
          'currentButtonIsUploadErrorButton': state === 'error',
        })}>
        <ButtonWithPanel className='profileSharingShareButton'
                         label='Share...'
                         panel={<ArrowPanel className='profileSharingPrivacyPanel'
                                            title={'Upload Profile – Privacy Notice'}
                                            okButtonText='Share'
                                            cancelButtonText='Cancel'
                                            onOkButtonClick={this._attemptToShare}>
                                  <PrivacyNotice/>
                                </ArrowPanel>}/>
        <UploadingStatus progress={uploadProgress}/>
        <ButtonWithPanel className='profileSharingPermalinkButton'
                         ref={this._permalinkButtonCreated}
                         label='Permalink'
                         panel={<ArrowPanel className='profileSharingPermalinkPanel'>
                                  <input type='text'
                                         className='profileSharingPermalinkTextField'
                                         value={'https://clptr.io/2gzRwzO' /* `https://new.cleopatra.io/public/${key}/` */}/>
                                </ArrowPanel>}/>
        <ButtonWithPanel className='profileSharingUploadErrorButton'
                         ref={this._uploadErrorButtonCreated}
                         label='Upload Error'
                         panel={<ArrowPanel className='profileSharingUploadErrorPanel'
                                            title={'Upload Error'}
                                            okButtonText='Try Again'
                                            cancelButtonText='Cancel'
                                            onOkButtonClick={this._attemptToShare}>
                                  <p>An error occurred during upload:</p>
                                  <pre>{`${error}`}</pre>
                                </ArrowPanel>}/>
      </div>
    );
  }
}

ProfileSharingCompositeButtonImpl.propTypes = {
  profile: PropTypes.object,
};

const ProfileSharingCompositeButton = connect(state => ({
  profile: getProfile(state),
}))(ProfileSharingCompositeButtonImpl);

const DownloadLinks = () => (
  <section>
    <p>Uncompressed: <a href='blob:aesouchaoseurh' download='Firefox profile 2016-11-28 16:22.sps.json'>Firefox profile 2016-11-28 16:22.sps.json</a></p>
    <p>Compressed: <a href='blob:aesouchaoseurh' download='Firefox profile 2016-11-28 16:22.sps.json.gz'>Firefox profile 2016-11-28 16:22.sps.json.gz</a></p>
  </section>
);

const ProfileDownloadButton = () => (
  <ButtonWithPanel className='profileSharingProfileDownloadButton'
                   label='Download...'
                   panel={<ArrowPanel className='profileSharingProfileDownloadPanel' title={'Download Profile'}>
                            <DownloadLinks/>
                          </ArrowPanel>}/>
);

const ProfileSharing = () => (
  <div className='profileSharing'>
    <ProfileSharingCompositeButton />
    <ProfileDownloadButton />
  </div>
);

export default ProfileSharing;
