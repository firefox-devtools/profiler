/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import { State, DeThunkObj, DispatchPropsBounds } from './types';
import { connect as reactReduxConnect } from 'react-redux';

/**
 * Convert a type into a fake value, which is useful for writing tests.
 */
export function typeToValue<T>(): T {
  return null as any;
}

/**
 * Create a type assertion on a value, which is useful to test if a type is working
 * as expected.
 *
 * TODO - It would also be nice to create an AssertEqual<A, B> type, but I'm not
 * sure how to do it at this time.
 */
export function assertValueHasType<A>(_assertion: A): void {}

/**
 * Coerce one type explicitly to another. Just using "as" will attempt to match
 * the previous object to the new one. This is a somewhat loose transformation.
 * This function allows for an explicit escape hatch where one type is explicitly
 * transformed into another. This has a benefit that the coercion is made explicit.
 */
export function coerce<A, B>(item: A): B {
  return item as any;
}

/**
 * Provide a custom connect function that wires into the default react-redux one.
 *
 * It maintains the legacy ordering from the Flow to TS migration.
 *
 * Legacy (Flow) ordering:
 *   <OwnProps, StateProps, DispatchProps>
 *
 * And maps it to the built-in ordering of:
 *   <OwnProps, StateProps, DispatchProps>
 *
 * In addition, it applies the de-thunking strategy of removing the (GetState, Dispatch)
 * from the Thunk action signature.
 */
export function connect<
  OwnProps,
  StateProps,
  ThunkedDispatch extends DispatchPropsBounds
>(
  mapStateToProps:
    | ((state: State, ownProps: OwnProps) => StateProps)
    | ((state: State) => StateProps),
  mapDispatchToProps: ThunkedDispatch
) {
  return reactReduxConnect<
    StateProps,
    DeThunkObj<ThunkedDispatch>,
    OwnProps,
    State
  >(
    mapStateToProps,
    coerce<ThunkedDispatch, DeThunkObj<ThunkedDispatch>>(mapDispatchToProps)
  );
}
