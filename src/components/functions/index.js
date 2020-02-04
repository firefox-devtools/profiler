/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { RunningTimesByFunc } from './RunningTimesByFunc';
import { FunctionCallers, FunctionCallees } from './FunctionButterfly';
import type { IndexIntoFuncTable } from '../../types/profile';

import './FunctionsPanel.css';

type State = {|
  selectedFuncIndex: IndexIntoFuncTable | null,
|};

export default class FunctionsPanel extends React.PureComponent<{||}, State> {
  state = {
    selectedFuncIndex: null,
  };

  onFunctionSelect = (funcIndex: IndexIntoFuncTable) => {
    this.setState({ selectedFuncIndex: funcIndex });
  };

  render() {
    const { selectedFuncIndex } = this.state;
    return (
      <div className="functions-panel">
        <RunningTimesByFunc onFunctionSelect={this.onFunctionSelect} />
        <div className="functions-panel-details">
          <h2>Callers</h2>
          <FunctionCallers funcIndex={selectedFuncIndex} />
          <h2>Callees</h2>
          <FunctionCallees funcIndex={selectedFuncIndex} />
        </div>
      </div>
    );
  }
}
