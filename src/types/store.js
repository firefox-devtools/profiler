/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Store as ReduxStore } from 'redux'; // eslint-disable-line import/named
import type { Action as ActionsRef } from './actions';
import type { State as StateRef } from './reducers';

// For some reason eslint is having trouble pulling this from our libdefs, but
// Flow is able to use it just fine.
// eslint-disable-next-line import/named
import type { Selector as ReselectSelector } from 'reselect';

// Re-export these here so they are easily available from wherever and avoids
// circular dependencies.
export type Action = ActionsRef;
export type State = StateRef;

// R = Result of a thunk action
type ThunkDispatch = <R>(action: ThunkAction<R>) => R;
type PlainDispatch = (action: Action) => Action;
export type GetState = () => State;
export type ThunkAction<R> = (dispatch: Dispatch, GetState) => R;
// The `dispatch` function can accept either a plain action or a thunk action.
// This is similar to a type `(action: Action | ThunkAction) => any` except this
// allows to type the return value as well.
export type Dispatch = PlainDispatch & ThunkDispatch;
export type Store = ReduxStore<State, Action, Dispatch>;
// Make a selector type that already knows about our State.
export type Selector<Returns> = ReselectSelector<State, *, Returns>;
