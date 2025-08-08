# Testing - `/src/test/`

To run the tests make sure that the node_modules are installed with `yarn install` and then run `yarn test`. To test an individual file `yarn test src/test/file-name.ts`.

Tests are run with [Jest](https://facebook.github.io/jest/) and use a behavior-driven testing style, with plain language descriptions.

```javascript
describe('the thing to be tested', function() {
  it('does some piece of work', function() {
    expect( ... ).toEqual(...);
  })
})
```

Assertions are written using [Jest's own Library](https://facebook.github.io/jest/docs/using-matchers.html#content).
We use `async`/`await` to test asynchronous code.

## Code coverage

The aim of all new code is to have good test coverage. A handy way to do this is to run a code coverage report. This can be done by running `yarn test-coverage`. This will build the coverage report, and serve it locally. All new code can be manually scanned to see where there is no coverage. Alternately [codecov.io](https://codecov.io/gh/firefox-devtools/profiler) provides a full coverage report for each PR, and the master branch.

## Type tests

Our type tests are a little different, because they do not use Jest. Instead, types are created that should pass the type system. In addition, the special comment `// @ts-expect-error` can be used for when errors are expected to be generated. If the types do not generate an error, then `yarn ts` will fail.

## The tests

| Test type                    | Description                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [components](./components)   | Tests for React components, utilizing Enzyme for full behavioral testing, and snapshot tests to ensure that components output correct markup. |
| [store](./store)             | Testing the [Redux](http://redux.js.org/) store using actions and selectors.                                                                  |
| [types](./types)             | Type tests.                                                                                                                                   |
| [unit](./unit)               | Unit testing                                                                                                                                  |
| [integration](./integration) | Integration testing                                                                                                                           |
