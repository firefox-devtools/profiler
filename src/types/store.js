/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/* eslint-disable import/named */
import type {
  Store as ReduxStore,
  ThunkAction as ReduxThunkAction,
  Dispatch as ReduxDispatch,
  GetState as ReduxGetState,
} from 'redux';
/* eslint-enable import/named */
import type { Action as ActionsRef } from './actions';
import type { State as StateRef } from './reducers';

// Re-export these here so they are easily available from wherever and avoids
// circular dependencies.
export type Action = ActionsRef;
export type State = StateRef;

export type GetState = ReduxGetState<State>;
export type ThunkAction<Result> = ReduxThunkAction<State, Action, Result>;
export type Store = ReduxStore<State, Action>;
export type Dispatch = ReduxDispatch<State, Action>;
