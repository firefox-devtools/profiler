# Testing in perf.html

To run the tests make sure that the node_modules are installed with `npm install` and then run `npm test`. To test an individual file `npm run test-file src/test/file-name.js`.

Tests are run with [Mocha](https://mochajs.org/) and use a behavior-driven testing style, with plain language descriptions.

```javascript
describe('the thing to be tested', function() {
  it('does some piece of work', function() {
    assert( ... );
  })
})
```

Assertions are written using [Chai's Assertion Library](http://chaijs.com/api/assert/)

## The tests

Right now there are [Redux store tests](./store) and [unit tests](./unit). React component tests are planned as well as eventually supporting full integration tests.
