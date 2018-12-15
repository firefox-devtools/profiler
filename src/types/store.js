/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Store as ReduxStore } from 'redux'; // eslint-disable-line import/named
import type { Action as ActionsRef } from './actions';
import type { State as StateRef } from './state';

/**
 * This file contains type definitions for the Redux store. Unlike the definitions
 * that are provided by the libdef, the store will be opinionated by this project's
 * specific union of Actions and the store's specific State type definition.
 */

// Re-export these here so they are easily available from wherever and avoids
// circular dependencies.
export type Action = ActionsRef;
export type State = StateRef;

type ThunkDispatch = <Returns>(action: ThunkAction<Returns>) => Returns;
type PlainDispatch = (action: Action) => Action;
export type GetState = () => State;

/**
 * A thunk action
 */
export type ThunkAction<Returns> = (dispatch: Dispatch, GetState) => Returns;

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

/**
 * This type definition takes a ThunkAction, and strips out the function
 * that accepts the (Dispatch, GetState). This is effectively what wrapping
 * the action in the connect function does.
 *
 * For instance:
 *   (...Args) => (Dispatch, GetState) => Returns
 *
 * Gets transformed into:
 *   (...Args) => Returns
 */
export type ConnectedThunk<Fn> = $Call<
  <Args, Returns>(
    // Take as input a ThunkAction.
    (...Args) => (Dispatch, GetState) => Returns
    // Return the wrapped action.
  ) => (...Args) => Returns,
  // Apply this to the function:
  Fn
>;
