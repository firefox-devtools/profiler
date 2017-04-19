# Redux store testing

The state management of perf.html happens in the Redux store, and is generally how the interactions within the UI are actually modeled. It is really important to have good test coverage here to cover possible regressions in how state is manipulated. These tests deal with pure state and do not get muddied with actual component presentation. These tests should not be brittle, they should run fast, and they should test off of the public facing interfaces.

# Reducers / Actions / Selectors

For maintainability and making complex interactions sane, state management is broken up into different parts.

 * *Reducers* care about how the canonical representation of the app state is stored. Actions come in, and a single state is retained.
 * *Actions* describe desired changes to the state, and provide the payload of information to be changed, but ignore how this is actually done.
 * *Selectors* provide a functional interface for selecting information within the data. They also map the data into derived states based on the canonical representation.

# How to test the Redux store

The reducer, actions, and selectors each do a small part of the functionality of state management, and are decoupled so they can evolve separately over time. However perf.html's tests care about how the state management works together as a single unit. Redux store tests should use the same APIs that are being used by the rest of the application, and should not know about implementation details or the internals of reducers and actions. This differs from the canonical testing examples from the Redux documentation which assert that action creators produce specifically shaped actions, and reducers correctly reduce actions.

# Testing steps

 1. Create a new blank store.
 2. Use a selector to grab the data that is being tested.
 3. Assert the initial state.
 4. Dispatch an action to effect the desired change.
 3. Re-run the selector.
 5. Assert the modified state.
 6. Repeat as needed.

These tests are typically short and easy to read, especially when written in a behavior-driven testing style, using plain language (BDD).

# Unit testing derived data and non-Redux store logic

Store tests get an easy access to all of the data, and can test how state changes through dispatching various actions. However it is also useful to unit test individual pieces of code that don't need to know about the store. These (ideally pure) functions can be pulled out of the Redux store files, and tested separately. For example in perf.html there are many functions that manipulate profiles to create derived data. These are easy to put into a separate file, and then export an interface that can be hooked up to the various selectors in the store. See the `src/content/profile-data.js` for an exaple of how this is done.
