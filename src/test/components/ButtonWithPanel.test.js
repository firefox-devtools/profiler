/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ButtonWithPanel from '../../components/shared/ButtonWithPanel';
import ArrowPanel from '../../components/shared/ArrowPanel';
import renderer from 'react-test-renderer';

describe('shared/ButtonWithPanel', function() {
  it('renders a closed panel and opens it when asked', () => {
    const button = renderer.create(
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
    expect(button).toMatchSnapshot();

    // Checking it correctly updates if the boolean property `open` changes.
    button.update(
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
    expect(button).toMatchSnapshot();
  });

  it('renders an opened panel', () => {
    const button = renderer.create(
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

    expect(button).toMatchSnapshot();
  });

  it('renders a disabled button', () => {
    const button = renderer.create(
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

    expect(button).toMatchSnapshot();
  });
});
