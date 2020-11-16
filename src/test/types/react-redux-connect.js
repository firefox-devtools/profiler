/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
// @flow

import * as React from 'react';
import { connect } from 'react-redux';

import type {
  State,
  Action,
  ThunkAction,
  Dispatch,
  GetState,
  ConnectedProps,
} from 'firefox-profiler/types';
/* eslint-disable no-unused-vars */
import {
  coerce,
  coerceThunk0,
  coerceThunk1,
  coerceThunk2,
} from '../../utils/flow';

// Use this any value to create fake variables as a type. Consider using
// `declare var myVariables: MyType;` instead. However, it can sometimes be clearer to
// create values inline, or from pre-existing type definitions. In addition,
// `declare var` is not correctly lexically scoped.
const ANY_VALUE = coerce<number, any>(0);
const numberValue: number = 5;
const stringValue: string = 'string';

/**
 * These type tests create various values that should all type check correctly to show
 * that the react-redux system is working correctly.
 */

type OwnProps = {|
  +ownPropString: string,
  +ownPropNumber: number,
|};

type StateProps = {|
  +statePropString: string,
  +statePropNumber: number,
|};

type ExampleActionCreator = string => Action;
type ExampleThunkActionCreator = string => ThunkAction<number>;

type DispatchProps = {|
  +dispatchString: ExampleActionCreator,
  // TODO - Switch to TypeScript and use a coerceThunk strategy, and infer the
  // DispatchProps.
  +dispatchThunk: ExampleThunkActionCreator,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class ExampleComponent extends React.PureComponent<Props> {
  render() {
    // Ensure that the React component has the correct types inside of it.
    (this.props.ownPropString: string);
    (this.props.ownPropNumber: number);
    (this.props.statePropString: string);
    (this.props.statePropNumber: number);

    // The action creators are properly wrapped by dispatch.
    (this.props.dispatchString: string => Action);

    // DispatchThunk is currently broken, but can be properly fixed by inferring
    // the type using a DeThunk strategy if and when we switch to TypeScript.
    //
    // ```js
    //   const mapStateToProps = (state: State) => ({
    //     foo: getFoo(state),
    //     bar: getBar(state),
    //   });

    //   const mapDispatchToProps = {
    //     // Fakes the transform:
    //     //   () => (D, GS) => Return
    //     //   () => Return
    //     doThunkAction0: coerceThunk0(doThunkAction0),
    //     // Fakes the transform:
    //     //   (A) => (D, GS) => Return
    //     //   (A) => Return
    //     doThunkAction1: coerceThunk1(doThunkAction1),
    //     // Fakes the transform:
    //     //   (A, B) => (D, GS) => Return
    //     //   (A, B) => Return
    //     doThunkAction2: coerceThunk2(doThunkAction2),
    //   };

    //   type StateProps = ReturnType<typeof mapStateToProps>;
    //   type DispatchProps = typeof mapDispatchToProps;
    //   type Props = ConnectedProps<{}, StateProps, DispatchProps>;
    // ```

    // $FlowFixMe - See comment above
    (this.props.dispatchThunk: string => number);
    // $FlowFixMe - See comment above
    (this.props.dispatchThunk('foo'): number);

    return null;
  }
}

const validMapStateToProps = (state: State, ownProps: OwnProps): StateProps => {
  return {
    statePropString: 'string',
    statePropNumber: 0,
  };
};

type DispatchToProps = {|
  +dispatchString: string => Action,
  +dispatchThunk: string => ThunkAction<number>,
|};

declare var validDispatchToProps: DispatchToProps;

// This value also serves as a test for the common case of creating a component
// with valid values.
const ConnectedExampleComponent = connect<OwnProps, StateProps, DispatchProps>(
  validMapStateToProps,
  validDispatchToProps
)(ExampleComponent);

type DeThunk0Expected = () => number;
type DeThunk1Expected = (a: string) => number;
type DeThunk2Expected = (a: string, b: number) => number;
{
  // Test the de-thunk process.
  const thunk0 = () => (dispatch: Dispatch, getState: GetState) => numberValue;
  const thunk1 = (a: string) => (dispatch: Dispatch, getState: GetState) =>
    numberValue;
  const thunk2 = (a: string, b: number) => (
    dispatch: Dispatch,
    getState: GetState
  ) => numberValue;

  const deThunk0Actual: DeThunk0Expected = coerceThunk0(thunk0);
  const deThunk1Actual: DeThunk1Expected = coerceThunk1(thunk1);
  const deThunk2Actual: DeThunk2Expected = coerceThunk2(thunk2);

  // $FlowExpectError
  const deThunk0Error: () => void = coerceThunk0(thunk0);
  // $FlowExpectError
  const deThunk1Error: () => void = coerceThunk1(thunk0);
  // $FlowExpectError
  const deThunk2Error: () => void = coerceThunk0(thunk0);
}

{
  // Test that mapStateToProps will error out if provided an extra value.
  connect<OwnProps, StateProps, DispatchProps>(
    // $FlowExpectError
    (state: State): StateProps => ({
      statePropString: 'string',
      statePropNumber: 0,
      extraValue: null,
    }),
    validDispatchToProps
  )(ExampleComponent);
}

{
  // Test that mapStateToProps will error if provided an extra value.
  connect<OwnProps, StateProps, DispatchProps>(
    (state: State): StateProps => ({
      statePropString: 'string',
      // $FlowExpectError
      statePropNumber: 'not a number',
    }),
    validDispatchToProps
  )(ExampleComponent);
}

{
  // Test that mapDispatchToProps will error if a value is omitted.
  connect<OwnProps, StateProps, DispatchProps>(
    validMapStateToProps,
    // $FlowExpectError
    (ANY_VALUE: {|
      +dispatchThunk: string => ThunkAction<number>,
    |})
  )(ExampleComponent);
}

{
  // Test that mapDispatchToProps will error if a variable type definition is wrong.
  connect<OwnProps, StateProps, DispatchProps>(
    validMapStateToProps,
    (ANY_VALUE: {|
      // $FlowExpectError
      +dispatchString: string => string,
      +dispatchThunk: string => ThunkAction<number>,
    |})
  )(ExampleComponent);
}

{
  // Test that mapDispatchToProps will error if an extra property is given.
  connect<OwnProps, StateProps, DispatchProps>(
    validMapStateToProps,
    // $FlowExpectError
    (ANY_VALUE: {|
      ...typeof validDispatchToProps,
      +extraProperty: string => string,
    |})
  )(ExampleComponent);
}

{
  // The connected component correctly takes OwnProps.
  <ConnectedExampleComponent ownPropString="string" ownPropNumber={0} />;
}

{
  // The connected component must not accept more props.
  // $FlowExpectError
  <ConnectedExampleComponent
    ownPropString="string"
    ownPropNumber={0}
    ownPropsExtra={0}
  />;
}

{
  // It throws an error when an OwnProps is incorrect.
  // $FlowExpectError
  <ConnectedExampleComponent ownPropString={0} ownPropNumber={0} />;
}

{
  // It throws an error if no OwnProps are provided.
  // $FlowExpectError
  <ConnectedExampleComponent />;
}
