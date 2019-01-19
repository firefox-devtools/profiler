/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ButtonWithPanel from '../../components/shared/ButtonWithPanel';
import ArrowPanel from '../../components/shared/ArrowPanel';
import { render } from 'react-testing-library';

describe('shared/ButtonWithPanel', function() {
  it('renders a closed panel and opens it when asked', () => {
    const { container, rerender } = render(
      <ButtonWithPanel
        className="button"
        label="My Button"
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );
    expect(container.firstChild).toMatchSnapshot();

    // Checking it correctly updates if the boolean property `open` changes.
    rerender(
      <ButtonWithPanel
        className="button"
        label="My Button"
        open={true}
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders an opened panel', () => {
    const { container } = render(
      <ButtonWithPanel
        className="button"
        label="My Button"
        open={true}
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders a disabled button', () => {
    const { container } = render(
      <ButtonWithPanel
        className="button"
        label="My Button"
        disabled={true}
        panel={
          <ArrowPanel className="panel">
            <div>Panel content</div>
          </ArrowPanel>
        }
      />
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
