/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { render, fireEvent, cleanup } from 'react-testing-library';
import TabBar from '../../components/app/TabBar';

afterEach(cleanup);

it('renders the TabBar', () => {
  const myMock = jest.fn();
  render(
    <TabBar
      selectedTabSlug="flame-graph"
      visibleTabs={[
        'calltree',
        'flame-graph',
        'stack-chart',
        'marker-chart',
        'marker-table',
        'network-chart',
      ]}
      onSelectTab={myMock}
    />
  );
});

it('calls onClick prop on tab click or enter key press', () => {
  const onClick = jest.fn();
  const { getByText } = render(<li onClick={onClick}>Stack Chart</li>);
  fireEvent.click(getByText('Stack Chart'));
  expect(onClick).toHaveBeenCalledTimes(1);
});
