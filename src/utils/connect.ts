/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type * as React from 'react';
import { connect } from 'react-redux';
import type {
  Dispatch,
  State,
  ThunkAction,
  Action,
} from 'firefox-profiler/types';

type MapStateToProps<
  OwnProps extends Record<string, any>,
  StateProps extends Record<string, any>,
> = (state: State, ownProps: OwnProps) => StateProps;

type MapDispatchToProps<
  OwnProps extends Record<string, any>,
  DispatchProps extends Record<string, any>,
> = ((dispatch: Dispatch, ownProps: OwnProps) => DispatchProps) | DispatchProps;

type MergeProps<
  StateProps,
  DispatchProps extends Record<string, any>,
  OwnProps extends Record<string, any>,
  Props extends Record<string, any>,
> = (
  stateProps: StateProps,
  dispatchProps: DispatchProps,
  ownProps: OwnProps
) => Props;

type ConnectOptions = {
  pure?: boolean;
  areStatesEqual?: boolean;
  areOwnPropsEqual?: boolean;
  areStatePropsEqual?: boolean;
  areMergedPropsEqual?: boolean;
  storeKey?: boolean;
  forwardRef?: boolean;
};

/**
 * This function type describes the operation of taking a simple action creator, and
 * just returning it.
 */
// @ts-ignore Currently unused but expect to be used when the migration is complete
type WrapActionCreator<Args extends any[]> = (
  actionCreator: (...args: Args) => Action
) => (...args: Args) => Action;

/**
 * This function type describes the operation of removing the (Dispatch, GetState) from
 * a thunk action creator.
 * For instance:
 *   (...Args) => (Dispatch, GetState) => Returns
 *
 * Gets transformed into:
 *   (...Args) => Returns
 */
// @ts-ignore Currently unused but expect to be used when the migration is complete
type WrapThunkActionCreator<Args extends any[], Returns> = (
  thunkActionCreator: (...args: Args) => ThunkAction<Returns>
) => (...args: Args) => Returns;

/**
 * This type takes a Props object and wraps each function in Redux's connect function.
 * It is primarily exported for testing as explicitConnect should do this for us
 * automatically. It leaves normal action creators alone, but with ThunkActions it
 * removes the (Dispatch, GetState) part of a ThunkAction.
 */
export type WrapDispatchProps<DispatchProps extends Record<string, any>> = {
  [K in keyof DispatchProps]: DispatchProps[K] extends (
    ...args: infer Args
  ) => ThunkAction<infer Returns>
    ? (...args: Args) => Returns
    : DispatchProps[K] extends (...args: infer Args) => Action
      ? (...args: Args) => Action
      : DispatchProps[K];
};

/**
 * This type takes a single action creator, and returns the type as if the dispatch
 * function was wrapped around it. It leaves normal action creators alone, but with
 * ThunkActions it removes the (Dispatch, GetState) part of a ThunkAction.
 */
export type WrapFunctionInDispatch<Fn> = Fn extends (
  ...args: infer Args
) => ThunkAction<infer Returns>
  ? (...args: Args) => Returns
  : Fn extends (...args: infer Args) => Action
    ? (...args: Args) => Action
    : Fn;

type ExplicitConnectOptions<
  OwnProps extends Record<string, any>,
  StateProps extends Record<string, any>,
  DispatchProps extends Record<string, any>,
> = {
  mapStateToProps?: MapStateToProps<OwnProps, StateProps>;
  mapDispatchToProps?: MapDispatchToProps<OwnProps, DispatchProps>;
  mergeProps?: MergeProps<
    StateProps,
    DispatchProps,
    OwnProps,
    ConnectedProps<OwnProps, StateProps, DispatchProps>
  >;
  options?: ConnectOptions;
  component: React.ComponentType<
    ConnectedProps<OwnProps, StateProps, DispatchProps>
  >;
};

export type ConnectedProps<
  OwnProps extends Record<string, any>,
  StateProps extends Record<string, any>,
  DispatchProps extends Record<string, any>,
> = Readonly<OwnProps & StateProps & DispatchProps>;

export type ConnectedComponent<
  OwnProps extends Record<string, any>,
  StateProps extends Record<string, any>,
  DispatchProps extends Record<string, any>,
> =
  | React.ComponentType<ConnectedProps<OwnProps, StateProps, DispatchProps>>
  | React.FunctionComponent<
      ConnectedProps<OwnProps, StateProps, DispatchProps>
    >;

/**
 * react-redux's connect function is too polymorphic and problematic. This function
 * is a wrapper to simplify the typing of connect and make it more explicit, and
 * less magical.
 */
export default function explicitConnect<
  OwnProps extends Record<string, any>,
  StateProps extends Record<string, any>,
  DispatchProps extends Record<string, any>,
>(
  connectOptions: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps>
): React.ComponentType<OwnProps> {
  const {
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    options,
    component,
  } = connectOptions;

  // Opt out of the flow-typed definition of react-redux's connect, and use our own.
  return (connect as any)(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    options
  )(component);
}

export function explicitConnectWithForwardRef<
  OwnProps extends Record<string, any>,
  StateProps extends Record<string, any>,
  DispatchProps extends Record<string, any>,
  RefInterface,
>(
  connectOptions: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps>
): React.ComponentType<OwnProps & { ref?: React.Ref<RefInterface> }> {
  const {
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    options,
    component,
  } = connectOptions;

  // Opt out of the flow-typed definition of react-redux's connect, and use our own.
  return (connect as any)(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    options
  )(component);
}
