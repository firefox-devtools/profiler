# Redux reducers and selectors - `/src/reducers`

This directory contains all of the [reducers](http://redux.js.org/docs/basics/Reducers.html) that are used to store state within this app. Reducers all accept some part of the store's state, and an action that is passed through a switch. This action is [Flow](https://flow.org/) typed as a [union](https://flow.org/en/docs/types/unions/) of all action objects, but [Flow](https://flow.org/) can understand the switch statements and will correctly infer which action is being used inside of the reducers. State is assumed to be immutable so that strict equality checks can tell when new bits of state are different.

## How to write a reducer

```js
const isThisTrueOrFalse: Reducer<boolean> = (state = false, action) => {
  switch (action.type) {
    case 'CHANGE_TO_TRUE':
      return true;
    case 'CHANGE_TO_FALSE':
      return false;
    default:
      return state;
  }
};
```

This simplistic reducer shows how to write a reducer for this project. Use a function that is typed as the [`Reducer<State>`](../types/state.js) type. The generic type takes a single type parameter, the type definition for the state. This type then enforces that the function being set follows that type signature, so no types are needed on the arguments or return type. The `action` argument is correctly typed to be the `Action` type, and the `state` and `return` value should be correctly set to the `State` value.

## Selectors

See [`src/selectors`](../selectors)) for how this state is accessed.

## Flow typing

The state is fully [Flow](https://flow.org/) typed and the definitions live in the [`src/types/state.js`](../types/state.js) file.
