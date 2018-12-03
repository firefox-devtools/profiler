/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import FunctionsList from '../shared/FunctionsList';
import { FunctionCallers, FunctionCallees } from './FunctionButterfly';
import type { IndexIntoFuncTable } from '../../types/profile';

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
        <FunctionsList onFunctionSelect={this.onFunctionSelect} />
        <FunctionCallers funcIndex={selectedFuncIndex} />
        <FunctionCallees funcIndex={selectedFuncIndex} />
      </div>
    );
  }
}
