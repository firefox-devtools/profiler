# Redux store testing

The state management of [profiler.firefox.com](https://profiler.firefox.com) happens in the [Redux](http://redux.js.org/) store, and is generally how the interactions within the UI are actually modeled. It is really important to have good test coverage here to cover possible regressions in how state is manipulated. These tests deal with pure state and do not get muddied with actual component presentation. These tests should not be brittle, they should run fast, and they should test off of the public facing interfaces.

## Reducers / Actions / Selectors

For maintainability and making complex interactions sane, Redux state management is broken up into different parts.

- _Reducers_ care about how the canonical representation of the app state is stored. Actions come in, and a single state is retained.
- _Actions_ describe desired changes to the state, and provide the payload of information to do the changing, but ignore how this is actually done.
- _Selectors_ provide a functional interface for selecting information within the data. They also map the data into derived states based on the canonical representation. These derivations are cached through memoization.

## How to test the Redux store

The reducer, actions, and selectors each do a small part of the functionality of state management, and are decoupled so they can evolve separately over time. However the tests care about how the state management works together as a single unit. Redux store tests should use the same APIs that are being used by the rest of the application, and should not know about implementation details or the internals of reducers and actions. This differs from the canonical testing examples from the Redux documentation which individually assert that action creators produce specifically shaped actions, and reducers correctly reduce actions.

## Testing steps

1.  Create a new blank store.
2.  Use a selector to grab the data that is being tested.
3.  Assert the initial state.
4.  Dispatch an action to affect the desired change.
5.  Re-run the selector.
6.  Assert the modified state.
7.  Repeat as needed.

These tests are typically short and easy to read, especially when written in a behavior-driven testing style, using plain language (BDD). They use the public-facing APIs that the rest of the application is designed with. They provide a large amount of coverage with minimal lines of code. They allow for easy refactors of the internals of the state representation and action shapes, while actually providing coverage for how the state actually behaves.

## Unit testing derived data and non-Redux store logic

Store tests get easy access to all of the data, and can test how state changes through dispatching various actions. However, it is also useful to unit test individual pieces of code that don't need to know about the store. These (ideally pure) functions can be pulled out of the Redux store files, and tested separately. For example in the project there are many functions that manipulate profiles to create derived data. These are easy to put into a separate file, and then export an interface that can be hooked up to the various selectors in the store. See the `src/profile-logic/profile-data.ts` for an example of how this is done.
