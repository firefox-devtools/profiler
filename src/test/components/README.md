# React component testing

## Snapshot tests

Snapshots provide an easy way to show how React components are rendered. Any time a component is updated, its snapshot needs to be regenerated. This can be done by running `yarn test -u`. The updated snapshot should be manually inspected by both the author and code reviewer to ensure that the changes that were made are intentional and correct. Care should be taken when writing snapshot tests, as they fail quite easily, and only show that *something* has changed. Generally one snapshot test for a component is pretty good, while the larger component behavior should be asserted using more specific Enzyme tests.

## Enzyme

[Enzyme](https://github.com/airbnb/enzyme) tests are good for asserting specific behavior of components. They should be used for things like testing event handlers, and specific behavior of components. Originally this project used [react-test-renderer](https://www.npmjs.com/package/react-test-renderer), but Enzyme proved more useful for triggering events and manipulating the component as a user would with a mouse and keyboard.

A danger with Enzyme tests is that they can be slow. Care should be taken with tests to ensure that only the necessary components should be rendered for a test. The best way to do this is to use the [shallow](https://github.com/airbnb/enzyme/blob/master/docs/api/shallow.md) render functionality. However, sometimes it is necessary to test all of the components rendered. This can be done with the [mount](https://github.com/airbnb/enzyme/blob/master/docs/api/mount.md) function.

## How to write an Enzyme test

Enzyme provides a lot of power that this project does not need. It is better to restrict the usage to simulating user events, and testing specific properties of the rendered component. This code snippet below shows the current best practices for writing an Enzyme test with this project.

```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { Provider } from 'react-redux';

// Care must be taken to use the appropriate amount of rendering that is needed.
// `mount` renders the entire component tree, and `shallow` only renders the component,
// and not the children. This example uses the helper function `shallowWithStore`
import { mount, shallow } from 'enzyme';

// `shallowWithStore` is a helper that connects a component to the Redux store, but
// still only shallowly renders it.
import { shallowWithStore } from '../fixtures/enzyme';
import MyComponent from '../../components/MyComponent';

describe('MyComponent', function() {
  /**
   * A setup function is handy because it handles common initialization and helpers
   * for each test run. This pattern is nice because it avoids side-effects, and makes
   * tests reproducible without worrying about mutation.
   */
  function setup() {
    // First set up a profile and Redux store. There are many helper functions that can
    // do this.
    const { profile } = getProfileFromTextSamples(`
      A    A    A  A
      B    B    B  B
      Cjs  Cjs  H  H
      D    F    I
      Ejs  Ejs
    `);

    // Create the component.
    const view = shallowWithStore(<MyComponent />, storeWithProfile(profile));

    // Use Enzyme to find parts of the component that are interesting to use in tests.
    // It can be helpful to collect these selectors in the setup function so that they
    // are easier to update when the markup and structure of a component changes.
    const outerDiv = view.find('.myComponentOuterDiv').first();

    // It can be helpful to create a few functions that will perform actions on the
    // component. This makes the tests more readable, as function names can be more
    // descriptive compared to a bunch of Enzyme simulate calls.
    function clickButton() {
      view
        .find('.myComponentButton')
        .simulate('click');
      view.update();
    }

    // It can also be helpful to write functions to look into the component for certain
    // properties. For instance, if this component adds to a list, it would be nice to
    // write a test against that specific behavior. A test that looks at a single
    // behavior of a component, like the size of a list, can provide a much more helpful
    // error message compared to a snapshot of the entire component, where it is unclear
    // if the snapshot failure is noise or not.
    function getListCount(): number {
      view.find('.myComponentListItem').length;
    }

    // The setup should return a large collectin of useful information that each test
    // is free to use or ignore.
    return {
      store,
      view,
      outerDiv,
      clickButton,
      getListCount,
    };
  }

  /**
   * Generally one snapshot test is nice to have. This helps authors and reviewers
   * know exactly how a component gets changed in a PR. It's not a good idea to have
   * too many of them, as it gets confusing to know what changes are intentional or not.
   */
  it('matches the snapshots', () => {
    const { view } = setup();
    expect(view).toMatchSnapshot();
  });

  /**
   * It can be nice to write a test that gives a friendly error message if some of the
   * assumptions of the component setup fails. It's better to fail earlier.
   */
  it('has selectors into useful parts of the component', () => {
    const { outerDiv } = setup();
    expect(outerDiv.exists()).toBe(true);
  });

  /**
   * When testing components, it's important to drive it as a user would interact with
   * the component. It's better to setup a Redux store with information, then use
   * button clicks, mouse movements, and other user interactions to test behavior. Then
   * the assertions can either look at the Redux state using a selector, or it can
   * look at how the component changes. The API used to drive tests should be restricted
   * to Redux actions, Redux selectors, simulated user actions, and selectors looking
   * into certain properties of the components.
   */
  it('adds to the list when clicking a button', () => {
    // Creating some helper functions can help make readable tests, especially when
    // creating many repetitive tests that assert various properties of the component.
    const { clickButton, getListCount } = setup();
    const originalCount = getListCount();
    clickButton();
    expect(getListCount()).toBe(originalCount + 1);
  });
});
```
