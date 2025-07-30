/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// Ignore for this file, which uses extensive use of generic type bounds, which
// triggers a false positive with this rule.
/* eslint-disable flowtype/no-weak-types */

// At this time, it's not worth migrating away from this existential type. It's
// probably possible to move to using the built-in react-redux types.
/* eslint-disable flowtype/no-existential-type */

import * as React from 'react';
import { connect } from 'react-redux';
import type {
  Dispatch,
  State,
  ThunkAction,
  Action,
} from 'firefox-profiler/types';

type MapStateToProps<OwnProps: Object, StateProps: Object> = (
  state: State,
  ownProps: OwnProps
) => StateProps;

type MapDispatchToProps<OwnProps: Object, DispatchProps: Object> =
  | ((dispatch: Dispatch, ownProps: OwnProps) => DispatchProps)
  | DispatchProps;

type MergeProps<
  StateProps,
  DispatchProps: Object,
  OwnProps: Object,
  Props: Object,
> = (
  stateProps: StateProps,
  dispatchProps: DispatchProps,
  ownProps: OwnProps
) => Props;

type ConnectOptions = {
  pure?: boolean,
  areStatesEqual?: boolean,
  areOwnPropsEqual?: boolean,
  areStatePropsEqual?: boolean,
  areMergedPropsEqual?: boolean,
  storeKey?: boolean,
  forwardRef?: boolean,
};

/**
 * This function type describes the operation of taking a simple action creator, and
 * just returning it.
 */
type WrapActionCreator<Args> = (
  // Take as input an action creator.
  (...Args) => Action
  // If this function matches the above signature, do not modify it.
) => (...Args) => Action;

/**
 * This function type describes the operation of removing the (Dispatch, GetState) from
 * a thunk action creator.
 * For instance:
 *   (...Args) => (Dispatch, GetState) => Returns
 *
 * Gets transformed into:
 *   (...Args) => Returns
 */
type WrapThunkActionCreator<Args, Returns> = (
  // Take as input a ThunkAction.
  (...Args) => ThunkAction<Returns>
  // Return the wrapped action.
) => (...Args) => Returns;

/**
 * This type takes a Props object and wraps each function in Redux's connect function.
 * It is primarily exported for testing as explicitConnect should do this for us
 * automatically. It leaves normal action creators alone, but with ThunkActions it
 * removes the (Dispatch, GetState) part of a ThunkAction.
 */
export type WrapDispatchProps<DispatchProps: Object> = $ObjMap<
  DispatchProps,
  WrapActionCreator<*> & WrapThunkActionCreator<*, *>,
>;

/**
 * This type takes a single action creator, and returns the type as if the dispatch
 * function was wrapped around it. It leaves normal action creators alone, but with
 * ThunkActions it removes the (Dispatch, GetState) part of a ThunkAction.
 */
export type WrapFunctionInDispatch<Fn: Function> = $Call<
  WrapActionCreator<*> & WrapThunkActionCreator<*, *>,
  Fn,
>;

type ExplicitConnectOptions<
  OwnProps: Object,
  StateProps: Object,
  DispatchProps: Object,
> = {
  mapStateToProps?: MapStateToProps<OwnProps, StateProps>,
  mapDispatchToProps?: MapDispatchToProps<OwnProps, DispatchProps>,
  mergeProps?: MergeProps<
    StateProps,
    DispatchProps,
    OwnProps,
    ConnectedProps<OwnProps, StateProps, DispatchProps>,
  >,
  options?: ConnectOptions,
  component: React.ComponentType<
    ConnectedProps<OwnProps, StateProps, DispatchProps>,
  >,
};

export type ConnectedProps<
  OwnProps: Object,
  StateProps: Object,
  DispatchProps: Object,
> = $ReadOnly<{
  ...OwnProps,
  ...StateProps,
  ...DispatchProps,
}>;

export type ConnectedComponent<
  OwnProps: Object,
  StateProps: Object,
  DispatchProps: Object,
> =
  | React.ComponentType<ConnectedProps<OwnProps, StateProps, DispatchProps>>
  | React.StatelessFunctionalComponent<
      ConnectedProps<OwnProps, StateProps, DispatchProps>,
    >;

/**
 * react-redux's connect function is too polymorphic and problematic. This function
 * is a wrapper to simplify the typing of connect and make it more explicit, and
 * less magical.
 */
export default function explicitConnect<
  OwnProps: Object,
  StateProps: Object,
  DispatchProps: Object,
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
  return (connect: any)(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    options
  )(component);
}
