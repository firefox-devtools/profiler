/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import { AppHeader } from './AppHeader';

import {
  listAllProfileData,
  type ProfileData,
} from 'firefox-profiler/app-logic/published-profiles-store';
import { formatSeconds } from 'firefox-profiler/utils/format-numbers';
import { ProfileMetaInfoSummary } from 'firefox-profiler/components/shared/ProfileMetaInfoSummary';

import type { Milliseconds, StartEndRange } from 'firefox-profiler/types/units';

import './ListOfPublishedProfiles.css';

// This component displays all published profile, and makes it possible to load
// them by clicking on them, or delete them.

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ONE_YEAR_IN_MS = 365 * ONE_DAY_IN_MS;

// All formats are lazy-initialized at the first use by using the `memoize`
// tool, because the DateTimeFormat constructor is slow.
// Because there's no parameter to these functions there will only ever be
// memoized once and should be fairly efficient. We can replace with a dedicated
// "lazy" function in the future if performance ever becomes a problem.
const dateFormats = {
  thisDay: memoize(
    () =>
      new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric' })
  ),
  thisYear: memoize(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      })
  ),
  ancient: memoize(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
  ),
};

function _formatDate(date: Date, nowTimestamp: Milliseconds) {
  const timeDifference = nowTimestamp - +date;
  if (timeDifference < 0 || timeDifference > ONE_YEAR_IN_MS) {
    return dateFormats.ancient().format(date);
  }
  if (timeDifference > ONE_DAY_IN_MS) {
    return dateFormats.thisYear().format(date);
  }
  return dateFormats.thisDay().format(date);
}

function _formatRange(range: StartEndRange): string {
  return formatSeconds(range.end - range.start, 3, 1);
}

type PublishedProfileProps = {|
  +profileData: ProfileData,
  +nowTimestamp: Milliseconds,
|};

function PublishedProfile({
  profileData,
  nowTimestamp,
}: PublishedProfileProps) {
  let { urlPath } = profileData;
  if (!urlPath.startsWith('/')) {
    urlPath = '/' + urlPath;
  }
  const location = `${window.location.origin}/${urlPath}`;
  return (
    <li className="publishedProfilesListItem">
      <a className="publishedProfilesLink" href={location}>
        <div className="publishedProfilesDate">
          {_formatDate(profileData.publishedDate, nowTimestamp)}
        </div>
        <div className="publishedProfilesName">
          <strong>
            {profileData.name
              ? profileData.name
              : `Profile #${profileData.profileToken.slice(0, 6)}`}
          </strong>{' '}
          ({_formatRange(profileData.publishedRange)})
        </div>
        <ProfileMetaInfoSummary meta={profileData.meta} />
      </a>
    </li>
  );
}

type State = {|
  profileDataList: null | ProfileData[],
|};

export class ListOfPublishedProfiles extends PureComponent<{||}, State> {
  state = {
    profileDataList: null,
  };

  async componentDidMount() {
    const profileDataList = await listAllProfileData();

    // It isn't ideal to use a setState here, but this is the only way.
    // eslint-disable-next-line react/no-did-mount-set-state
    this.setState({
      // We want to display the list with the most recent uploaded profile first.
      profileDataList: profileDataList.reverse(),
    });
  }

  render() {
    const { profileDataList } = this.state;

    if (!profileDataList) {
      return null;
    }

    if (!profileDataList.length) {
      return (
        <main className="publishedProfiles">
          <AppHeader />
          <h2 className="photon-title-30">Uploaded Recordings</h2>
          <p className="photon-body-30">No profile has been published yet!</p>
        </main>
      );
    }

    const nowTimestamp = Date.now();

    return (
      <main className="publishedProfiles">
        <AppHeader />
        <h2 className="photon-title-30">Uploaded Recordings</h2>
        {/* TODO Maybe we should use a grid layout later */}
        <ul className="publishedProfilesList">
          {profileDataList.map(profileData => (
            <PublishedProfile
              key={profileData.profileToken}
              profileData={profileData}
              nowTimestamp={nowTimestamp}
            />
          ))}
        </ul>
      </main>
    );
  }
}
