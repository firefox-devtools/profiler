/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import { getShowTabOnly } from '../../selectors/url-state';
import FullTimeline from '../timeline/FullTimeline';
import ActiveTabTimeline from '../timeline/ActiveTabTimeline';

import type { BrowsingContextID } from '../../types/profile';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +showTabOnly: BrowsingContextID | null,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class Timeline extends React.PureComponent<Props> {
  render() {
    const { showTabOnly } = this.props;
    // Show different timeline components depending on the view we are in.
    // If showTabOnly state is non-null, then show the active tab timeline.
    // Otherwise, show the full timeline.
    return showTabOnly === null ? <FullTimeline /> : <ActiveTabTimeline />;
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    showTabOnly: getShowTabOnly(state),
  }),
  component: Timeline,
});
