import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';
import { getProfile, getProfileViewOptions } from '../selectors/';
import { gzipString } from '../gz';
import { uploadBinaryProfileData } from '../cleopatra-profile-store';
import ArrowPanel from '../components/ArrowPanel';
import ButtonWithPanel from '../components/ButtonWithPanel';
import { shortenCleopatraUrl } from '../shorten-cleopatra-url';
import { serializeProfile } from '../preprocess-profile';
import prettyBytes from 'pretty-bytes';

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

class ProfileSharingCompositeButton extends Component {
  constructor(props) {
    super(props);
    this.state = {
      state: 'local',  // local -> uploading (<-> error) -> public
      uploadProgress: 0,
      key: '',
      error: '',
      fullURL: '',
      shortURL: '',
    };
    this._attemptToShare = this._attemptToShare.bind(this);
    this._onPermalinkPanelOpen = this._onPermalinkPanelOpen.bind(this);
    this._onPermalinkPanelClose = this._onPermalinkPanelClose.bind(this);
    this._permalinkButtonCreated = elem => { this._permalinkButton = elem; };
    this._uploadErrorButtonCreated = elem => { this._uploadErrorButton = elem; };
    this._permalinkTextFieldCreated = elem => { this._permalinkTextField = elem; };
  }

  _onPermalinkPanelOpen() {
    shortenCleopatraUrl(this.state.fullURL).then(shortURL => {
      this.setState({ shortURL });
      if (this._permalinkTextField) {
        this._permalinkTextField.focus();
        this._permalinkTextField.select();
      }
    });
  }

  _onPermalinkPanelClose() {
    if (this._permalinkTextField) {
      this._permalinkTextField.blur();
    }
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
      const jsonString = serializeProfile(profile);
      if (!jsonString) {
        throw new Error('profile serialization failed');
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
        fullURL: `https://new.cleopatra.io/public/${key}/`,
        shortURL: `https://new.cleopatra.io/public/${key}/`,
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
    const { state, uploadProgress, error, shortURL } = this.state;
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
                         panel={
          <ArrowPanel className='profileSharingPrivacyPanel'
                      title={'Upload Profile – Privacy Notice'}
                      okButtonText='Share'
                      cancelButtonText='Cancel'
                      onOkButtonClick={this._attemptToShare}>
            <PrivacyNotice/>
          </ArrowPanel>
        }/>
        <UploadingStatus progress={uploadProgress}/>
        <ButtonWithPanel className='profileSharingPermalinkButton'
                         ref={this._permalinkButtonCreated}
                         label='Permalink'
                         panel={
          <ArrowPanel className='profileSharingPermalinkPanel'
                      onOpen={this._onPermalinkPanelOpen}
                      onClose={this._onPermalinkPanelClose}>
            <input type='text'
                   className='profileSharingPermalinkTextField'
                   value={shortURL}
                   ref={this._permalinkTextFieldCreated}/>
          </ArrowPanel>
        }/>
        <ButtonWithPanel className='profileSharingUploadErrorButton'
                         ref={this._uploadErrorButtonCreated}
                         label='Upload Error'
                         panel={
          <ArrowPanel className='profileSharingUploadErrorPanel'
                      title={'Upload Error'}
                      okButtonText='Try Again'
                      cancelButtonText='Cancel'
                      onOkButtonClick={this._attemptToShare}>
            <p>An error occurred during upload:</p>
            <pre>{`${error}`}</pre>
          </ArrowPanel>
        }/>
      </div>
    );
  }
}

ProfileSharingCompositeButton.propTypes = {
  profile: PropTypes.object,
};

function filenameDateString(d) {
  const pad = x => x < 10 ? `0${x}` : `${x}`;
  return `${pad(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

class ProfileDownloadButton extends Component {
  constructor(props) {
    super(props);
    this.state = {
      uncompressedBlobUrl: '',
      compressedBlobUrl: '',
      uncompressedSize: 0,
      compressedSize: 0,
      filename: '',
    };
    this._onPanelOpen = this._onPanelOpen.bind(this);
  }

  _onPanelOpen() {
    const { profile, viewOptions } = this.props;
    const profileDate = new Date(profile.meta.startTime + viewOptions.rootRange.start);
    const serializedProfile = serializeProfile(profile);
    const blob = new Blob([serializedProfile], { type: 'application/octet-binary' });
    const blobURL = URL.createObjectURL(blob);
    this.setState({
      filename: `${profile.meta.product} ${filenameDateString(profileDate)} profile.sps.json`,
      uncompressedBlobUrl: blobURL,
      uncompressedSize: blob.size,
    });
    gzipString(serializedProfile).then(data => {
      const blob = new Blob([data], { type: 'application/octet-binary' });
      const blobURL = URL.createObjectURL(blob);
      this.setState({
        compressedBlobUrl: blobURL,
        compressedSize: blob.size,
      });
    });
  }

  render() {
    const {
      filename, uncompressedBlobUrl, compressedBlobUrl,
      uncompressedSize, compressedSize,
    } = this.state;
    return (
      <ButtonWithPanel className='profileSharingProfileDownloadButton'
                       label='Download...'
                       panel={
        <ArrowPanel className='profileSharingProfileDownloadPanel'
                    title={'Download Profile'}
                    onOpen={this._onPanelOpen}>
          <section>
            { uncompressedBlobUrl
                ? <p>
                    <a className='profileSharingDownloadLink'
                       href={uncompressedBlobUrl}
                       download={filename}>
                      {`${filename} (${prettyBytes(uncompressedSize)})`}
                    </a>
                  </p>
                : null }
            { compressedBlobUrl
                ? <p>
                    <a className='profileSharingDownloadLink'
                       href={compressedBlobUrl}
                       download={`${filename}.gz`}>
                      {`${filename}.gz (${prettyBytes(compressedSize)})`}
                    </a>
                  </p>
                : null }
          </section>
        </ArrowPanel>
      }/>
    );
  }
}

ProfileDownloadButton.propTypes = {
  profile: PropTypes.object,
  viewOptions: PropTypes.object,
};

const ProfileSharing = ({ profile, viewOptions }) => (
  <div className='profileSharing'>
    <ProfileSharingCompositeButton profile={profile}/>
    <ProfileDownloadButton profile={profile} viewOptions={viewOptions}/>
  </div>
);

ProfileSharing.propTypes = {
  profile: PropTypes.object,
  viewOptions: PropTypes.object,
};

export default connect(state => ({
  profile: getProfile(state),
  viewOptions: getProfileViewOptions(state),
}))(ProfileSharing);
