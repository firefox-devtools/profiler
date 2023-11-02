/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// The "call tree strategy" is the listbox that lets you choose between "Timing"
// and various allocation call trees. It is only shown when the profile includes
// allocation data.

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { undropFunctions } from 'firefox-profiler/actions/profile-view';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';
import { DroppedFunctionsPanel } from './DroppedFunctionsPanel';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import './PanelSettingsList.css';
import './DroppedFunctionsSetting.css';

import type { DroppedFunctions } from 'firefox-profiler/types';

type StateProps = {|
  +droppedFunctions: DroppedFunctions,
|};

type DispatchProps = {|
  +undropFunctions: typeof undropFunctions,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class DroppedFunctionsSettingImpl extends PureComponent<Props> {
  _panelPosition = { anchorEdge: 'left', distanceFromEdge: 200 };

  render() {
    const { droppedFunctions } = this.props;
    const numberOfDroppedFunctions = droppedFunctions.length;

    return (
      <Localized
        id="DroppedFunctions--settings-button"
        attrs={{ label: true, title: true }}
        vars={{ numberOfDroppedFunctions }}
      >
        <ButtonWithPanel
          label={`${numberOfDroppedFunctions} dropped functions`}
          buttonClassName="droppedFunctionsDropdownButton"
          panelContent={<DroppedFunctionsPanel />}
          panelClassName="droppedFunctionsPanel"
          panelPosition={this._panelPosition}
        />
      </Localized>
    );
  }
}

export const DroppedFunctionsSetting = explicitConnect<
  {||},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    droppedFunctions: selectedThreadSelectors.getDroppedFunctions(state),
  }),
  mapDispatchToProps: {
    undropFunctions,
  },
  component: DroppedFunctionsSettingImpl,
});
