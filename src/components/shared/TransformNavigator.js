/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import explicitConnect from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { FilterNavigatorBar } from './FilterNavigatorBar';
import { popTransformsFromStack } from 'firefox-profiler/actions/profile-view';

import type { State } from 'firefox-profiler/types';
import type { ElementProps } from 'react';

import './TransformNavigator.css';

type Props = ElementProps<typeof FilterNavigatorBar>;
type DispatchProps = {
  readonly onPop: $PropertyType<Props, 'onPop'>,
};
type StateProps = $Diff<Props, DispatchProps>;

export const TransformNavigator = explicitConnect<
  {},
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state: State) => {
    const items = selectedThreadSelectors.getLocalizedTransformLabels(state);

    return {
      className: 'calltreeTransformNavigator',
      items,
      selectedItem: items.length - 1,
    };
  },
  mapDispatchToProps: { onPop: popTransformsFromStack },
  component: FilterNavigatorBar,
});
