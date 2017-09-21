/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Store as ReduxStore } from 'redux'; // eslint-disable-line import/named
import type { Action as ActionsRef } from './actions';
import type { State as StateRef } from './reducers';

// Re-export these here so they are easily available from wherever and avoids
// circular dependencies.
export type Action = ActionsRef;
export type State = StateRef;

type ThunkDispatch = <R>(action: ThunkAction<R>) => R;
type PlainDispatch = (action: Action) => Action;
export type GetState = () => State;
export type ThunkAction<R> = (dispatch: Dispatch, GetState) => R;
export type Dispatch = PlainDispatch & ThunkDispatch;
export type Store = ReduxStore<State, Action, Dispatch>;
