/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
// @flow

import * as React from 'react';
import { withSize, type SizeProps } from '../../components/shared/WithSize';
/* eslint-disable no-unused-vars, flowtype/no-unused-expressions */

/**
 * This file tests the WithSize higher order component, and makes sure that it correctly
 * strips off the width and height from the component's props.
 */

type Props = {|
  +ownPropA: 'a',
  +ownPropB: 'b',
  ...SizeProps,
|};

class ExampleComponent extends React.PureComponent<Props> {
  render() {
    (this.props.ownPropA: 'a');
    (this.props.ownPropB: 'b');
    // $FlowExpectError  - There is no "ownPropC"
    (this.props.ownPropC: 'c');
    (this.props.width: number);
    (this.props.height: number);

    return null;
  }
}

// A normal component can be created.
const example1 = (
  <ExampleComponent ownPropA="a" ownPropB="b" width={10} height={10} />
);

// Passing in an unknown prop provides an error.
const example2 = (
  // $FlowExpectError - There is no "ownPropC"
  <ExampleComponent
    ownPropA="a"
    ownPropB="b"
    ownPropC="c"
    width={10}
    height={10}
  />
);

const ExampleComponentWithSize = withSize(ExampleComponent);

// This it the correct use
const exampleWithSize1 = <ExampleComponentWithSize ownPropA="a" ownPropB="b" />;

const exampleWithSize2 = (
  // $FlowExpectError - The width and height are already provided by WithSize.
  <ExampleComponentWithSize ownPropA="a" ownPropB="b" width={10} height={10} />
);

// Passing in an unknown prop provides an error.
const exampleWithSize3 = (
  // $FlowExpectError - The width and height are already provided.
  <ExampleComponentWithSize ownPropA="a" ownPropB="b" ownPropC="c" />
);
