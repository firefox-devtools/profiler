// @flow
import React, { PureComponent } from 'react';
import { Warning } from '../shared/Warning';
import explicitConnect from '../../utils/connect';
import { getProfile } from '../../selectors/profile';
import type { Profile } from 'firefox-profiler/types';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +profile: Profile,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
class DebugWarning extends PureComponent<Props> {
  render() {
    const { profile } = this.props;

    const { meta } = profile;

    return (
      <>
        {meta.debug ? (
          <Warning message="This profile was recorded in a build without release optimizations. Performance obervations might not apply to the release population." />
        ) : null}
      </>
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    profile: getProfile(state),
  }),
  component: DebugWarning,
});
