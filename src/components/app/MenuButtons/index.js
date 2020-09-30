/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// It's important to import the base CSS file first, so that CSS in the
// subcomponents can more easily override the rules.
import './index.css';

import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from '../../../utils/connect';
import {
  getProfile,
  getProfileRootRange,
  getSymbolicationStatus,
} from '../../../selectors/profile';
import { getDataSource } from '../../../selectors/url-state';
import { getIsNewlyPublished } from '../../../selectors/app';
import { MenuButtonsMetaInfo } from './MetaInfo';
import { MenuButtonsPublish } from './Publish';
import { MenuButtonsPermalink } from './Permalink';
import { ButtonWithPanel } from '../../shared/ButtonWithPanel';
import { revertToPrePublishedState } from '../../../actions/publish';
import { dismissNewlyPublished } from '../../../actions/app';
import {
  getAbortFunction,
  getUploadPhase,
  getHasPrePublishedState,
} from '../../../selectors/publish';

import { resymbolicateProfile } from '../../../actions/receive-profile';

import type {
  StartEndRange,
  Profile,
  DataSource,
  UploadPhase,
  SymbolicationStatus,
} from 'firefox-profiler/types';

import type { ConnectedProps } from '../../../utils/connect';

type OwnProps = {|
  // This is for injecting a URL shortener for tests. Normally we would use a Jest mock
  // that would mock out a local module, but I was having trouble getting it working
  // correctly (perhaps due to ES6 modules), so I just went with dependency injection
  // instead.
  injectedUrlShortener?: string => Promise<string>,
|};

type StateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +dataSource: DataSource,
  +isNewlyPublished: boolean,
  +uploadPhase: UploadPhase,
  +hasPrePublishedState: boolean,
  +symbolicationStatus: SymbolicationStatus,
  +abortFunction: () => mixed,
|};

type DispatchProps = {|
  +dismissNewlyPublished: typeof dismissNewlyPublished,
  +revertToPrePublishedState: typeof revertToPrePublishedState,
  +resymbolicateProfile: typeof resymbolicateProfile,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class MenuButtons extends React.PureComponent<Props> {
  componentDidMount() {
    // Clear out the newly published notice from the URL.
    this.props.dismissNewlyPublished();
  }

  _renderPublishPanel() {
    const { uploadPhase, dataSource, abortFunction } = this.props;

    const isUploading =
      uploadPhase === 'uploading' || uploadPhase === 'compressing';

    if (isUploading) {
      return (
        <button
          type="button"
          className="menuButtonsButton menuButtonsAbortUploadButton"
          onClick={abortFunction}
        >
          Cancel Upload
        </button>
      );
    }

    const isRepublish = dataSource === 'public' || dataSource === 'compare';
    const isError = uploadPhase === 'error';

    let label = 'Publish…';
    if (isRepublish) {
      label = 'Re-publish…';
    }
    if (isError) {
      label = 'Error publishing…';
    }

    return (
      <ButtonWithPanel
        className={classNames({
          menuButtonsShareButton: true,
          menuButtonsShareButtonOriginal: !isRepublish && !isError,
          menuButtonsShareButtonError: isError,
        })}
        buttonClassName="menuButtonsButton"
        panelClassName="menuButtonsPublishPanel"
        label={label}
        panelContent={<MenuButtonsPublish isRepublish={isRepublish} />}
      />
    );
  }

  _renderPermalink() {
    const { dataSource, isNewlyPublished, injectedUrlShortener } = this.props;

    const showPermalink =
      dataSource === 'public' ||
      dataSource === 'from-url' ||
      dataSource === 'compare';

    return showPermalink ? (
      <MenuButtonsPermalink
        isNewlyPublished={isNewlyPublished}
        injectedUrlShortener={injectedUrlShortener}
      />
    ) : null;
  }

  _renderRevertProfile() {
    const { hasPrePublishedState, revertToPrePublishedState } = this.props;
    if (!hasPrePublishedState) {
      return null;
    }
    return (
      <button
        type="button"
        className="menuButtonsButton menuButtonsRevertButton"
        onClick={revertToPrePublishedState}
      >
        Revert to Original Profile
      </button>
    );
  }

  render() {
    const { profile, symbolicationStatus, resymbolicateProfile } = this.props;
    return (
      <>
        {/* Place the info button outside of the menu buttons to allow it to shrink. */}
        <MenuButtonsMetaInfo
          profile={profile}
          symbolicationStatus={symbolicationStatus}
          resymbolicateProfile={resymbolicateProfile}
        />
        <div className="menuButtons">
          {this._renderRevertProfile()}
          {this._renderPublishPanel()}
          {this._renderPermalink()}
          <a
            href="/docs/"
            target="_blank"
            className="menuButtonsLink"
            title="Open the documentation in a new window"
          >
            Docs
            <i className="open-in-new" />
          </a>
        </div>
      </>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    dataSource: getDataSource(state),
    isNewlyPublished: getIsNewlyPublished(state),
    uploadPhase: getUploadPhase(state),
    hasPrePublishedState: getHasPrePublishedState(state),
    symbolicationStatus: getSymbolicationStatus(state),
    abortFunction: getAbortFunction(state),
  }),
  mapDispatchToProps: {
    dismissNewlyPublished,
    revertToPrePublishedState,
    resymbolicateProfile,
  },
  component: MenuButtons,
});
