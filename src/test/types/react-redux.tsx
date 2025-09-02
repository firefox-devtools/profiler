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
import { connect } from 'react-redux';

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
 *
 * We are catching the following mistakes at the type level:
 *
 *                            explicitConnect           plain connect
 * mapStateToProps:
 * - missing prop             yes                       yes
 * - prop with wrong type     yes                       yes
 * - extra prop               no (was yes with Flow)    no
 *
 * mapDispatchToProps:
 * - missing prop             yes                       yes
 * - action wrong type        yes                       yes
 * - thunk action wrong type  yes                       yes
 * - extra prop               no (was yes with Flow)    no
 *
 * OwnProps:
 * - missing prop             yes                       yes
 * - prop with wrong type     yes                       yes
 * - extra prop               yes                       yes
 *
 * In summary, we lost the ability to detect unused state props and unused
 * dispatch props when we migrated to TypeScript. On the other hand,
 * explicitConnect now catches the same mistakes as plain connect, so we
 * can migrate to plain connect at any time without losing type coverage.
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
  const exampleAction = (_string: string) => ANY_VALUE as Action;
  const exampleThunkAction =
    (_string: string) => (_dispatch: Dispatch, _getState: GetState) =>
      ANY_VALUE as number;
  const exampleThunkActionWrapped = (_string: string) => 5;
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
  // Test that mapStateToProps will error out if a value is missing
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    // @ts-expect-error - Should detect missing statePropNumber
    mapStateToProps: (_state) => ({
      statePropString: 'string',
    }),
    mapDispatchToProps: validDispatchToProps,
    component: ExampleComponent,
  });
}

{
  // Test that mapStateToProps will error if if provided a property with the wrong type.
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
  // Test that mapStateToProps will error out if provided an extra value... It will not :(
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: (_state) => ({
      statePropString: 'string',
      statePropNumber: 0,
      extraValue: null, // would be nice if this caused an error
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
  // Test that mapDispatchToProps will error if a string is given where an action is expected.
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
  // Test that mapDispatchToProps will error if a ThunkAction of the wrong type is given.
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
    // @ts-expect-error - ThunkAction<string> is not ThunkAction<number>
    mapDispatchToProps: ANY_VALUE as {
      readonly dispatchString: (string: string) => Action;
      readonly dispatchThunk: (string: string) => ThunkAction<string>;
    },
    component: ExampleComponent,
  });
}

{
  // Test that mapDispatchToProps will error if an extra property is given... it will not. :(
  explicitConnect<OwnProps, StateProps, DispatchProps>({
    mapStateToProps: validMapStateToProps,
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
  // It detects an error when an OwnProps is incorrect.
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
  // It detects an error if no OwnProps are provided.
  // @ts-expect-error - missing ownPropString, ownPropNumber
  const x = <ConnectedExampleComponent />;
  markUsed(x);
}

// -----------

// Now let's try to use regular connect.

const connector = connect(validMapStateToProps, validDispatchToProps);
const PlainConnectedExampleComponent = connector(ExampleComponent);

const checkPlainType: React.ComponentType<OwnProps> =
  PlainConnectedExampleComponent;
markUsed(checkPlainType);

{
  // Test that mapStateToProps will error if a property is missing.
  const connector = connect(
    (_state) => ({
      statePropString: 'string',
    }),
    validDispatchToProps
  );
  const Comp = connector(ExampleComponent);

  // @ts-expect-error - statePropNumber is missing
  const x = <Comp ownPropString="string" ownPropNumber={0} />;
  markUsed(x);

  // @ts-expect-error - statePropNumber is missing
  const compCheck: React.ComponentType<OwnProps> = Comp;
  markUsed(compCheck);
}

{
  // Test that mapStateToProps will error if provided a property with the wrong type.
  const connector = connect(
    (_state) => ({
      statePropString: 'string',
      statePropNumber: 'not a number',
    }),
    validDispatchToProps
  );
  // @ts-expect-error - string not assignable to number
  connector(ExampleComponent);
}

{
  // Test that mapStateToProps will error out if provided an extra value... it will not. :(
  const connector = connect(
    (_state) => ({
      statePropString: 'string',
      statePropNumber: 0,
      extraValue: null, // would be nice if this caused an error
    }),
    validDispatchToProps
  );
  connector(ExampleComponent);
}

{
  // Test that mapDispatchToProps will error if a value is omitted.
  const connector = connect(
    validMapStateToProps,
    ANY_VALUE as {
      readonly dispatchThunk: (string: string) => ThunkAction<number>;
    }
  );
  const Comp = connector(ExampleComponent);

  // @ts-expect-error - dispatchString is missing
  const x = <Comp ownPropString="string" ownPropNumber={0} />;
  markUsed(x);

  // @ts-expect-error - dispatchString is missing
  const compCheck: React.ComponentType<OwnProps> = Comp;
  markUsed(compCheck);
}

{
  // Test that mapDispatchToProps will error if a string is given where an action is expected.
  const connector = connect(
    validMapStateToProps,
    ANY_VALUE as {
      readonly dispatchString: (string: string) => string;
      readonly dispatchThunk: (string: string) => ThunkAction<number>;
    }
  );
  // @ts-expect-error - a string is not an Action
  const Comp = connector(ExampleComponent);
  markUsed(Comp);
}

{
  // Test that mapDispatchToProps will error if a ThunkAction of the wrong type is given.
  const connector = connect(
    validMapStateToProps,
    ANY_VALUE as {
      readonly dispatchString: (string: string) => Action;
      readonly dispatchThunk: (string: string) => ThunkAction<string>;
    }
  );
  // @ts-expect-error - string is not assignable to number
  const Comp = connector(ExampleComponent);
  markUsed(Comp);
}

{
  // Test that mapDispatchToProps will error if an extra property is given... it will not. :(
  const connector = connect(
    validMapStateToProps,
    ANY_VALUE as typeof validDispatchToProps & {
      readonly extraProperty: (string: string) => string; // would be nice if this caused an error
    }
  );
  const Comp = connector(ExampleComponent);
  markUsed(Comp);
}

{
  // The connected component correctly takes OwnProps.
  const x = (
    <PlainConnectedExampleComponent ownPropString="string" ownPropNumber={0} />
  );
  markUsed(x);
}

{
  // The connected component must not accept more props.
  const x = (
    <PlainConnectedExampleComponent
      ownPropString="string"
      ownPropNumber={0}
      // @ts-expect-error - ownPropsExtra does not exist on type ...
      ownPropsExtra={0}
    />
  );
  markUsed(x);
}

{
  // It detects an error when an OwnProps is incorrect.
  const x = (
    <PlainConnectedExampleComponent
      // @ts-expect-error - number not assignable to string
      ownPropString={0}
      ownPropNumber={0}
    />
  );
  markUsed(x);
}

{
  // It detects an error if no OwnProps are provided.
  // @ts-expect-error - missing ownPropString, ownPropNumber
  const x = <PlainConnectedExampleComponent />;
  markUsed(x);
}
