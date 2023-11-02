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
import { getSelectedThreadsKey } from 'firefox-profiler/selectors/url-state';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import './DroppedFunctionsPanel.css';

import type {
  DroppedFunctions,
  ThreadsKey,
  FunctionDisplayData,
} from 'firefox-profiler/types';

type StateProps = {|
  +droppedFunctions: DroppedFunctions,
  +droppedFunctionsDisplayData: FunctionDisplayData[],
  +threadsKey: ThreadsKey,
|};

type DispatchProps = {|
  +undropFunctions: typeof undropFunctions,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class DroppedFunctionsPanelImpl extends PureComponent<Props> {
  _onClearAllButtonClick = () => {
    const { droppedFunctions, undropFunctions, threadsKey } = this.props;
    undropFunctions(threadsKey, new Set(droppedFunctions));
  };

  _onRemoveButtonClick = (event: SyntheticInputEvent<>) => {
    const { undropFunctions, threadsKey } = this.props;
    const funcIndex: string | void = event.target.dataset.funcIndex;
    if (funcIndex !== undefined) {
      undropFunctions(threadsKey, new Set([+funcIndex]));
    }
  };

  render() {
    const { droppedFunctions, droppedFunctionsDisplayData } = this.props;
    return (
      <>
        <p className="droppedFunctionsClearAllRow">
          <Localized
            id="DroppedFunctions--clear-all-button"
            attrs={{ value: true, title: true }}
          >
            <input
              type="button"
              value="Clear all"
              onClick={this._onClearAllButtonClick}
            />
          </Localized>
        </p>
        <div className="functionListBoxInPanel">
          {droppedFunctions.length > 0 ? (
            <ol
              className="functionListBoxList"
              onClick={this._onRemoveButtonClick}
            >
              {droppedFunctionsDisplayData.map((displayData, i) => {
                return (
                  <li key={i} className="functionListBoxListItem">
                    <Localized
                      id="DroppedFunctions--remove-button"
                      attrs={{ value: true, title: true }}
                    >
                      <input
                        type="button"
                        value="Remove"
                        className="functionListItemRemoveButton"
                        data-func-index={displayData.funcIndex}
                      />
                    </Localized>
                    <span className="functionListBoxFunctionName">
                      {displayData.name} {displayData.originAnnotation}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Localized id="DroppedFunctions--empty-list-message">
              <p className="functionListBoxNote">
                To add functions to this list, right-click a function in the
                call tree and choose “Drop samples with this function”.
              </p>
            </Localized>
          )}
        </div>
      </>
    );
  }
}

export const DroppedFunctionsPanel = explicitConnect<
  {||},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    droppedFunctions: selectedThreadSelectors.getDroppedFunctions(state),
    droppedFunctionsDisplayData:
      selectedThreadSelectors.getDroppedFunctionsDisplayData(state),
    threadsKey: getSelectedThreadsKey(state),
  }),
  mapDispatchToProps: {
    undropFunctions,
  },
  component: DroppedFunctionsPanelImpl,
});
