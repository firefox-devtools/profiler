/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// TypeScript types

import { Store as ReduxStore } from 'redux';
import { Action } from './actions';
import { State } from './state';

/**
 * This file contains type definitions for the Redux store. Unlike the definitions
 * that are provided by the libdef, the store will be opinionated by this project's
 * specific union of Actions and the store's specific State type definition.
 */

/**
 * The selector type enforces the selector pattern, and should be used when
 * defining selectors. These selectors can be simple functions, or created using
 * the reselect library. This type enforces the common pattern of a pure function that
 * only accesses the state, and selects, or derives something from it.
 *
 * See the type below for additional considerations.
 */
export type Selector<T> = (state: State) => T;

/**
 * Selectors generally come in two different varieties: selectors that trivially access
 * a value, and selectors that do some kind of complex or expensive computation.
 *
 * Simple selectors are used to build up a language of functions for looking up values
 * in the state. For instance a selector named `getMyProperty` could trivially
 * access that from the state `state => state.myProperty`. This function can then be
 * used in other selectors to de-couple the access of some state, from where the state
 * is actually stored. These are really cheap to run.
 *
 * Selectors using the "reselect" library can memoize complicated or expensive
 * derived state. These selectors often combine multiple pieces of state and then
 * run some kind of function to derive the desired information. This way when any of
 * the pieces of dependent state used for the calculation change, then the entire
 * function is invalidated and runs again.
 *
 * A "dangerous" problem arises if this memoized function takes an argument that does
 * not come directly from the state. The additional argument can break the typical
 * memoization pattern, and could be used incorrectly to re-compute something expensive.
 * Care should be taken that a value isn't needlessly recomputed. The following type is
 * used as a hint that something a bit different is going on with the selector, and
 * memoization might not be happening in the same way.
 *
 * See: https://github.com/reduxjs/reselect/blob/master/README.md#q-how-do-i-create-a-selector-that-takes-an-argument
 */
export type DangerousSelectorWithArguments<T, A1, A2 = void, A3 = void> = (
  state: State,
  arg1: A1,
  arg2: A2,
  arg3: A3
) => T;

type ThunkDispatch = <Returns>(action: ThunkAction<Returns>) => Returns;
type PlainDispatch = (action: Action) => Action;
export type GetState = () => State;

/**
 * A thunk action
 */
export type ThunkAction<Returns> = (
  dispatch: Dispatch,
  getState: GetState
) => Returns;

/**
 * The `dispatch` function can accept either a plain action or a thunk action.
 * This is similar to a type `(action: Action | ThunkAction) => any` except this
 * allows to type the return value as well.
 */
export type Dispatch = PlainDispatch & ThunkDispatch;

/**
 * Export a store that is opinionated about our State definition, and the union
 * of all Actions, as well as specific Dispatch behavior.
 */
export type Store = ReduxStore<State, Action, Dispatch>;
