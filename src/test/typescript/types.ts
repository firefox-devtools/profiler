/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// Stub out the store types.
export interface State {
  fake: 'example';
}
export type Action = { type: 'FAKE_EXAMPLE1' } | { type: 'FAKE_EXAMPLE2' };

export type ConnectedProps<
  OwnProps,
  StateProps,
  DispatchProps extends DispatchPropsBounds
> = Readonly<OwnProps & StateProps & DeThunkObj<DispatchProps>>;

type ThunkDispatch = <Returns>(action: ThunkAction<Returns>) => Returns;
export type PlainDispatch = (action: Action) => Action;
export type GetState = () => State;

/**
 * A thunk action.
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
 * Remove the (GetState, Dispatch) from the ThunkAction.
 *
 * For example:
 *   From: (...args) => (GetState, Dispatch) => Return
 *   To:   (...args) => Return
 *
 * Or more simply:
 *   From: (...args) => ThunkAction<Return>
 *   To:   (...args) => Return
 */
export type DeThunk<T extends (...args: any[]) => ThunkAction<any>> = (
  ...args: Parameters<T>
) => ReturnType<ReturnType<T>>;

type ActionCreatorBounds = (...args: any[]) => Action;
type ThunkActionCreatorBounds = (...args: any[]) => ThunkAction<any>;

/**
 * Use this to extend a generic.
 *
 * For example:
 *   type MyType<DispatchProps extends DispatchPropsBounds>
 */
export type DispatchPropsBounds = {
  [key: string]: ActionCreatorBounds | ThunkActionCreatorBounds;
};

/**
 * Apply DeThunk to an object, like DispatchProps.
 */
// prettier-ignore
export type DeThunkObj<
  DispatchProps extends DispatchPropsBounds
> = {
  [Key in keyof DispatchProps]:
    DispatchProps[Key] extends ThunkActionCreatorBounds
      ? DeThunk<DispatchProps[Key]>
      : DispatchProps[Key];
};
