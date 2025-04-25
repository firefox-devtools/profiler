/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { TabBar } from '../../components/app/TabBar';
import { fireFullClick } from '../fixtures/utils';

describe('app/TabBar', () => {
  it('renders the TabBar and handles clicks properly', () => {
    const handleTabSelection = jest.fn();
    const { container } = render(
      <TabBar
        width={1000}
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

    fireFullClick(screen.getByText('Call Tree'));
    expect(handleTabSelection).toHaveBeenCalledWith('calltree');
  });
});
