/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
/* eslint-disable @typescript-eslint/no-unused-vars */

import * as React from 'react';

import {
  State,
  Action,
  ThunkAction,
  ConnectedProps,
  DeThunkObj,
} from './types';

import { assertValueHasType, typeToValue, connect } from './utils';

/**
 * These type tests create various values that should all type check correctly to show
 * that the react-redux system is working correctly.
 */

type OwnProps = {
  ownPropString: string;
  ownPropNumber: number;
};

type StateProps = {
  statePropString: string;
  statePropNumber: number;
};

type ExampleActionCreator = (a: string) => Action;
type ExampleThunkActionCreator = (a: string) => ThunkAction<number>;

type DispatchProps = {
  dispatchString: ExampleActionCreator;
  dispatchThunkNumber: ExampleThunkActionCreator;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class ExampleComponent extends React.PureComponent<Props> {
  render() {
    // Ensure that the React component has the correct types inside of it.
    assertValueHasType<string>(this.props.ownPropString);
    assertValueHasType<number>(this.props.ownPropNumber);
    assertValueHasType<string>(this.props.statePropString);
    assertValueHasType<number>(this.props.statePropNumber);

    // The action creators are properly wrapped by dispatch.
    assertValueHasType<(a: string) => Action>(this.props.dispatchString);
    assertValueHasType<(a: string) => number>(this.props.dispatchThunkNumber);
    assertValueHasType<number>(this.props.dispatchThunkNumber('foo'));

    assertValueHasType<(a: string) => number>(this.props.dispatchThunkNumber);
    assertValueHasType<number>(this.props.dispatchThunkNumber('foo'));

    return null;
  }
}

const validMapStateToProps = (state: State, ownProps: OwnProps): StateProps => {
  return {
    statePropString: 'string',
    statePropNumber: 0,
  };
};

const mapStateToPropsNoOwnProps = (state: State): StateProps => {
  return {
    statePropString: 'string',
    statePropNumber: 0,
  };
};

const dispatchString = typeToValue<(a: string) => Action>();
const dispatchThunkNumber = typeToValue<(a: string) => ThunkAction<number>>();

const validDispatchToProps = {
  dispatchString,
  dispatchThunkNumber: dispatchThunkNumber,
};

const ConnectedExampleComponent = connect<OwnProps, StateProps, DispatchProps>(
  validMapStateToProps,
  validDispatchToProps
)(ExampleComponent);

{
  // Test mapStateToProps with no OwnProps.
  connect<OwnProps, StateProps, DispatchProps>(
    mapStateToPropsNoOwnProps,
    validDispatchToProps
  )(ExampleComponent);
}

{
  // Test de-Thunking an object
  type DispatchPropsThunked = {
    action: (a: string) => Action;
    thunk0: () => ThunkAction<number>;
    thunk1: (a: string) => ThunkAction<number>;
    thunk2: (a: string, b: number) => ThunkAction<number>;
  };

  type ExpectedDispatchPropsDeThunked = {
    action: (a: string) => Action;
    thunk0: () => number;
    thunk1: (a: string) => number;
    thunk2: (a: string, b: number) => number;
  };

  type ActualDispatchPropsDeThunked = DeThunkObj<DispatchPropsThunked>;

  assertValueHasType<ExpectedDispatchPropsDeThunked>(
    typeToValue<ActualDispatchPropsDeThunked>()
  );
}

{
  connect<OwnProps, StateProps, DispatchProps>(
    (state: State): StateProps => ({
      statePropString: 'string',
      statePropNumber: 0,
      // @ts-expect-error - Extra value in StateProps
      extraValue: null,
    }),
    validDispatchToProps
  )(ExampleComponent);
}

{
  connect<OwnProps, StateProps, DispatchProps>(
    (state: State): StateProps => ({
      statePropString: 'string',
      // @ts-expect-error - Expected a number, not a string.
      statePropNumber: 'not a number',
    }),
    validDispatchToProps
  )(ExampleComponent);
}

{
  const missingValueProps = typeToValue<{
    dispatchThunkNumber: (a: string) => ThunkAction<number>;
  }>();

  connect<OwnProps, StateProps, DispatchProps>(
    validMapStateToProps,
    // @ts-expect-error - mapDispatchToProps will error if a value is omitted.
    missingValueProps
  )(ExampleComponent);
}

{
  const wrongProps = typeToValue<{
    dispatchString: (a: string) => string;
    dispatchThunkNumber: (a: string) => ThunkAction<number>;
  }>();

  connect<OwnProps, StateProps, DispatchProps>(
    validMapStateToProps,
    // @ts-expect-error - mapDispatchToProps will error if a variable type definition is wrong.
    wrongProps
  )(ExampleComponent);
}

// TODO - This assertion is not working.
//
// {
//   const extraValueProps = typeToValue<
//     DispatchProps & {
//       extraProperty: (a: string) => string;
//     }
//   >();
//   connect<OwnProps, StateProps, DispatchProps>(
//     validMapStateToProps,
//     // @ts-expect-error - mapDispatchToProps will error if an extra property is given.
//     extraValueProps
//   )(ExampleComponent);
// }

{
  const deThunkedDispatchProps = typeToValue<DeThunkObj<DispatchProps>>();
  connect<OwnProps, StateProps, DispatchProps>(
    validMapStateToProps,
    // @ts-expect-error - De-thunking dispatch props early on is an error.
    deThunkedDispatchProps
  )(ExampleComponent);
}

{
  // The connected component correctly takes OwnProps.
  <ConnectedExampleComponent ownPropString="string" ownPropNumber={0} />;
}

{
  <ConnectedExampleComponent
    ownPropString="string"
    ownPropNumber={0}
    // @ts-expect-error - The connected component must not accept more props.
    ownPropsExtra={0}
  />;
}

{
  // @ts-expect-error - It throws an error when an OwnProps is incorrect.
  <ConnectedExampleComponent ownPropString={0} ownPropNumber={0} />;
}

{
  // @ts-expect-error - It throws an error if no OwnProps are provided.
  <ConnectedExampleComponent />;
}
