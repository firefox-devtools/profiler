# Redux reducers and selectors - `/src/reducers`

This directory contains all of the [reducers](http://redux.js.org/docs/basics/Reducers.html) that are used to store state within this app. Reducers all accept some part of the store's state, and an action that is passed through a switch. This action has a [TypeScript](https://www.typescriptlang.org/) type which is a [union](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types) of all action objects. The type system understands the switch statements and will correctly infer which action is being used inside of the reducers. State is assumed to be immutable so that strict equality checks can tell when new bits of state are different.

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

This simplistic reducer shows how to write a reducer for this project. Use a function that is typed as the [`Reducer<State>`](../types/state.ts) type. The generic type takes a single type parameter, the type definition for the state. This type then enforces that the function being set follows that type signature, so no types are needed on the arguments or return type. The `action` argument is correctly typed to be the `Action` type, and the `state` and `return` value should be correctly set to the `State` value.

## Selectors

See [`src/selectors`](../selectors)) for how this state is accessed.

## Types

The state types in the [`src/types/state.ts`](../types/state.ts) file.
