/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
import * as React from 'react';
import explicitConnect from '../../utils/connect';

import type {
  ConnectedProps,
  WrapDispatchProps,
  WrapFunctionInDispatch,
} from '../../utils/connect';
import type {
  State,
  Action,
  ThunkAction,
  Dispatch,
  GetState,
} from 'firefox-profiler/types';

// Use this any value to create fake variables as a type. Consider using
// `declare var myVariables: MyType;` instead. However, it can sometimes be clearer to
// create values inline, or from pre-existing type definitions. In addition,
// `declare const` is not lexically scoped.
const ANY_VALUE: any = 0;

function expectType<T>(_a: T) {}
function markUsed<T>(_a: T) {}

/**
 * These type tests create various values that should all type check correctly to show
 * that the react-redux system is working correctly.
 */

type OwnProps = {
  readonly ownPropString: string;
  readonly ownPropNumber: number;
};

type StateProps = {
  readonly statePropString: string;
  readonly statePropNumber: number;
};

type ExampleActionCreator = (string: string) => Action;
type ExampleThunkActionCreator = (string: string) => ThunkAction<number>;

type DispatchProps = {
  readonly dispatchString: ExampleActionCreator;
  readonly dispatchThunk: ExampleThunkActionCreator;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class ExampleComponent extends React.PureComponent<Props> {
  override render() {
    // Ensure that the React component has the correct types inside of it.
    expectType<string>(this.props.ownPropString);
    expectType<number>(this.props.ownPropNumber);
    expectType<string>(this.props.statePropString);
    expectType<number>(this.props.statePropNumber);

    // The action creators are properly wrapped by dispatch.
    expectType<(string: string) => Action>(this.props.dispatchString);
    expectType<(string: string) => number>(this.props.dispatchThunk);
    expectType<number>(this.props.dispatchThunk('foo'));

    return null;
  }
}

const validMapStateToProps = (_state: State, _ownProps: OwnProps) => {
  return {
    statePropString: 'string',
    statePropNumber: 0,
  };
};

declare const validDispatchToProps: {
  readonly dispatchString: (string: string) => Action;
  readonly dispatchThunk: (string: string) => ThunkAction<number>;
};

// This value also serves as a test for the common case of creating a component
// with valid values.
const ConnectedExampleComponent = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: validMapStateToProps,
  mapDispatchToProps: validDispatchToProps,
  component: ExampleComponent,
});

{
  // Test that WrapDispatchProps modifies the ThunkActions.
  const wrapped: WrapDispatchProps<DispatchProps> = ANY_VALUE as {
    readonly dispatchString: (string: string) => Action;
    readonly dispatchThunk: (string: string) => number;
  };
  markUsed(wrapped);
}

{
  // Test that the original unwrapped action creators do not work.
  // @ts-expect-error - raw actions / thunk actions not assignable to WrapDispatchProps.
  const wrapped: WrapDispatchProps<DispatchProps> = ANY_VALUE as {
    readonly dispatchString: (string: string) => Action;
    readonly dispatchThunk: (string: string) => ThunkAction<number>;
  };
  markUsed(wrapped);
}

{
  // Test that WrapFunctionInDispatch works to strip off the return action.
  const exampleAction = (string: string) => ANY_VALUE as Action;
  const exampleThunkAction =
    (string: string) => (dispatch: Dispatch, getState: GetState) =>
      ANY_VALUE as number;
  const exampleThunkActionWrapped = (string: string) => 5;
  markUsed(exampleThunkActionWrapped);

  expectType<WrapFunctionInDispatch<ExampleActionCreator>>(exampleAction);
  expectType<WrapFunctionInDispatch<ExampleThunkActionCreator>>(
    exampleThunkActionWrapped
  );
  expectType<WrapFunctionInDispatch<ExampleThunkActionCreator>>(
    // @ts-expect-error - We're passing a raw ExampleThunkActionCreator instead of a WrapFunctionInDispatch<...>
    exampleThunkAction
  );
}

{
  // Test that mapStateToProps will error out if provided an extra value.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    // $FlowExpectError
    mapStateToProps: (_state) => ({
      statePropString: 'string',
      statePropNumber: 0,
      extraValue: null,
    }),
    mapDispatchToProps: validDispatchToProps,
    component: ExampleComponent,
  });
}

{
  // Test that mapStateToProps will error if provided an extra value.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    // @ts-expect-error - string not assignable to number
    mapStateToProps: (_state) => ({
      statePropString: 'string',
      statePropNumber: 'not a number',
    }),
    mapDispatchToProps: validDispatchToProps,
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if a value is omitted.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    // @ts-expect-error - Should detect missing dispatchString
    mapDispatchToProps: ANY_VALUE as {
      readonly dispatchThunk: (string: string) => ThunkAction<number>;
    },
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if a variable type definition is wrong.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    // @ts-expect-error - a string is not an Action
    mapDispatchToProps: ANY_VALUE as {
      readonly dispatchString: (string: string) => string;
      readonly dispatchThunk: (string: string) => ThunkAction<number>;
    },
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if an extra property is given.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    // $FlowExpectError
    mapDispatchToProps: ANY_VALUE as typeof validDispatchToProps & {
      readonly extraProperty: (string: string) => string;
    },
    component: ExampleComponent,
  });
}

{
  // The connected component correctly takes OwnProps.
  const x = (
    <ConnectedExampleComponent ownPropString="string" ownPropNumber={0} />
  );
  markUsed(x);
}

{
  // The connected component must not accept more props.
  const x = (
    <ConnectedExampleComponent
      ownPropString="string"
      ownPropNumber={0}
      // @ts-expect-error - ownPropsExtra does not exist on type ...
      ownPropsExtra={0}
    />
  );
  markUsed(x);
}

{
  // It throws an error when an OwnProps is incorrect.
  const x = (
    <ConnectedExampleComponent
      // @ts-expect-error - number not assignable to string
      ownPropString={0}
      ownPropNumber={0}
    />
  );
  markUsed(x);
}

{
  // It throws an error if no OwnProps are provided.
  // @ts-expect-error - missing ownPropString, ownPropNumber
  const x = <ConnectedExampleComponent />;
  markUsed(x);
}
