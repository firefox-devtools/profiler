/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This function records all of the analytics events that are fired through side effects,
 * but then handles all cleanup after running the callback function that actually
 * holds the test.
 */
export function withAnalyticsMock(
  callback: (mock: jest.MockContext<any, any>) => void
) {
  const mockedGa = jest.fn();
  self.ga = mockedGa;
  callback(mockedGa.mock);
  delete self.ga;
}
