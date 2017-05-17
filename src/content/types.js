// @flow

import type { Store as ReduxStore } from 'redux'; // eslint-disable-line import/named
import type { Action } from './actions/types';
import type { State } from './reducers/types';

export type Store = ReduxStore<State, Action>;
