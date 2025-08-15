# React components - `/src/components/`

This folder contains all of the React components that power [profiler.firefox.com](https://profiler.firefox.com). The folder structure is broken down by the contents of different tabs, and other logical groupings. For instance `calltree` and `stack-chart` contain the components that power the Call Tree panel, and the Stack Chart panel respectively. These components can be both connected components (e.g. components that are actively connected to the Redux store), utility components, and components that are directly passed in props. Making components generic is fine, but they are still stored close to where they are used. The only exception is when a components starts to be shared across multiple areas. In this case it is located in the `shared` folder. The preference for modules should be to keep them close to where they are used, even if it would be easy to abstract them out.

## Pure components

This project assumes that the data it uses is immutable. Because of this, each component should be a PureComponent to reduce the amount of component updates that happen for each individual mounted component. Pure components are components that use shallow equality on the props to determine whether the component should be updated. Effort should be made to ensure that components will do the right thing when performing this equality check. Derived data should be memoized whenever possible so that `===` checks work correctly.

## Connecting Redux

Some components use the `connect()` function to hook up the contents of the [Redux](http://redux.js.org/) store to be used within the component, and to wrap the action creators with the store's dispatch method.

### Example connect:

```js
export default connect(
  // The first parameter's function receives the Redux state. Use the selectors located
  // in the src/selectors directory to select the relevant information from the state.
  // Selectors are often memoized, and so as these functions are run multiple times,
  // their results will still pass a strict equality test for component updates.
  (state: State) => ({
    profile: getProfile(state),
    dataSource: getDataSource(state),
    hash: getHash(state),
    profileUrl: getProfileUrl(state),
  }),
  // The second parameter is the list of action creators to be wrapped with dispatch.
  // These should be explicitly listed out. (Many components still do not do this and
  // passed in the full actions object. This is incrementally being addressed.)
  {
    retrieveProfileFromStore,
    retrieveProfileOrZipFromUrl,
    retrieveProfileFromBrowser,
  }
  // Finally pass in the non-connected component. Redux will then merge the various
  // objects together to create new props.
)(MyComponent);
```

## Class names in components

### Shared components class names

Class names can be long (ok very long). They should grow from the component name. In a shared component they should just take the component name, and then grow from their for different DOM nodes. For instance for an imaginary component called `SharedWidget`, the root `<div>` could have the class name `sharedWidget`, while a button inside could be `sharedWidgetButton`, and then inside of that `sharedWidgetButtonText`.

### Component groups class names

For a group of components, the first word should be the name of the subdirectory, and then it should grow from there with the component names. For instance in an imaginary `src/components/widget` subdirectory, a `Panel` component would have the class `widgetComponent`. Then a button element inside could have `widgetComponentButton`.
