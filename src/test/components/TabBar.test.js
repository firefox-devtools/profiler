/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import TabBar from '../../components/app/TabBar';

describe('app/TabBar', () => {
  it('renders the TabBar and handles clicks properly', () => {
    const handleTabSelection = jest.fn();
    const { getByText, container } = render(
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
        onSelectTab={handleTabSelection}
      />
    );
    expect(container.firstChild).toMatchSnapshot();

    const leftClick = { button: 0 };
    fireEvent.click(getByText('Call Tree'), leftClick);
    expect(handleTabSelection).toHaveBeenCalledWith('calltree');
  });
});
