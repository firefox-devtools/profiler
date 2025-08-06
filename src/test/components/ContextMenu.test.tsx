/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { ContextMenu } from '../../components/shared/ContextMenu';

describe('ContextMenu', function () {
  it('correctly renders the context-menu with the props that were passed through', () => {
    const { container } = render(
      <ContextMenu
        id="contextMenu"
        className="context-menu"
        data={{}}
        onShow={() => null}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
