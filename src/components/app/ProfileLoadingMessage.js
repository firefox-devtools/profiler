/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { getProfileLoadingState } from '../../selectors/profile';

import type {
  ProfileLoadingState,
  ProfileLoadingStep,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/types';

type StateProps = {|
  +profileLoadingStep: ProfileLoadingStep,
  +progress: number,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class ProfileLoadingMessage extends PureComponent<Props> {
  // get profile loading state
  // display current loading step
  // display progress bar, if any
}
