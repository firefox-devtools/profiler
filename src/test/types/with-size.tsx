/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
// @flow

import * as React from 'react';
import { withSize, type SizeProps } from '../../components/shared/WithSize';

/**
 * This file tests the WithSize higher order component, and makes sure that it correctly
 * catches mismatches of props with the type system.
 */

type Props = {
  readonly ownPropA: 'a';
  readonly ownPropB: 'b';
} & SizeProps;

function expectType<T>(_a: T) {}
function markUsed<T>(_a: T) {}

class ExampleComponent extends React.PureComponent<Props> {
  render() {
    expectType<'a'>(this.props.ownPropA);
    expectType<'b'>(this.props.ownPropB);
    // @ts-expect-error  - There is no "ownPropC"
    expectType<any>(this.props.ownPropC);
    expectType<number>(this.props.width);
    expectType<number>(this.props.height);

    return null;
  }
}

// A normal component can be created.
const example1 = (
  <ExampleComponent ownPropA="a" ownPropB="b" width={10} height={10} />
);
markUsed(example1);

// Passing in an unknown prop triggers an error.
const example2 = (
  <ExampleComponent
    ownPropA="a"
    ownPropB="b"
    // @ts-expect-error - There is no "ownPropC"
    ownPropC="c"
    width={10}
    height={10}
  />
);
markUsed(example2);

const ExampleComponentWithSize = withSize(ExampleComponent);

// This it the correct use
const exampleWithSize1 = <ExampleComponentWithSize ownPropA="a" ownPropB="b" />;
markUsed(exampleWithSize1);

const exampleWithSize2 = (
  // @ts-expect-error - The width and height are already provided.
  <ExampleComponentWithSize ownPropA="a" ownPropB="b" width={10} height={10} />
);
markUsed(exampleWithSize2);

// Passing in an unknown prop triggers an error.
const exampleWithSize3 = (
  // @ts-expect-error - The width and height are already provided.
  <ExampleComponentWithSize ownPropA="a" ownPropB="b" ownPropC="c" />
);
markUsed(exampleWithSize3);

// @ts-expect-error - ownPropB was not passed in.
const exampleWithSize4 = <ExampleComponentWithSize ownPropA="a" />;
markUsed(exampleWithSize4);

type NoSizingProps = {
  readonly ownPropA: 'a';
  readonly ownPropB: 'b';
  // The size props are omitted.
};

class NoSizing extends React.PureComponent<NoSizingProps> {
  render() {
    return null;
  }
}

// @ts-expect-error - The component does not have sizing props.
const exampleNoSizing = withSize(NoSizing);
markUsed(exampleNoSizing);
