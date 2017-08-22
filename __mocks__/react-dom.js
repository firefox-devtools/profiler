/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* global jest */

const reactDOM = jest.genMockFromModule('react-dom');

// Overwrite this in the test to mock it.
reactDOM.__findDOMNode = () => {};

reactDOM.findDOMNode = function(...args) {
  return reactDOM.__findDOMNode(...args);
};

module.exports = reactDOM;
