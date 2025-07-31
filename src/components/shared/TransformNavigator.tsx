/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import explicitConnect from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { FilterNavigatorBar } from './FilterNavigatorBar';
import { popTransformsFromStack } from 'firefox-profiler/actions/profile-view';

import { State } from 'firefox-profiler/types';
import { ComponentProps } from 'react';

import './TransformNavigator.css';

type Props = ComponentProps<typeof FilterNavigatorBar>;
type DispatchProps = {
  readonly onPop: Props['onPop'];
};
type StateProps = Omit<Props, keyof DispatchProps>;

export const TransformNavigator = explicitConnect<
  {},
  StateProps,
  DispatchProps
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
