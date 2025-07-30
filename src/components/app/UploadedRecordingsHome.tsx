/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Localized } from '@fluent/react';
import React, { PureComponent } from 'react';
import { AppHeader } from './AppHeader';
import { ListOfPublishedProfiles } from './ListOfPublishedProfiles';

import './UploadedRecordingsHome.css';

// This component represents the root page for uploaded recordings. It doesn't
// do much more than providing a header for ListOfPublishedProfiles.

export class UploadedRecordingsHome extends PureComponent<{}> {
  override render() {
    return (
      <main className="uploadedRecordingsHome">
        <AppHeader />
        <h2 className="photon-title-30">
          <Localized id="UploadedRecordingsHome--title">
            Uploaded Recordings
          </Localized>
        </h2>
        <ListOfPublishedProfiles withActionButtons={true} />
      </main>
    );
  }
}