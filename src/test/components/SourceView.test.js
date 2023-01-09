/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { stripIndent } from 'common-tags';

import { ProfileViewer } from 'firefox-profiler/components/app/ProfileViewer';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from 'firefox-profiler/actions/receive-profile';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import { ensureExists } from 'firefox-profiler/utils/flow';

import {
  render,
  screen,
  within,
} from 'firefox-profiler/test/fixtures/testing-library';
import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect.js';

// We're not interested in the timeline in this test
jest.mock('../../components/timeline', () => ({
  Timeline: 'custom-timeline',
}));

describe('SourceView', () => {
  autoMockDomRect();
  afterEach(() => {
    delete Range.prototype.getClientRects;
  });

  function setup() {
    if (Range.prototype.getClientRects) {
      throw new Error(
        'jsdom now implements Range.prototype.getClientRects, please update this test.'
      );
    }

    // @codemirror/view uses getClientRects when scrolling.
    // $FlowExpectError because Flow doesn't accept assigning a function to getClientRects.
    Range.prototype.getClientRects = () => {
      return [new DOMRect(0, 0, 1024, 768)];
    };

    const revision = '997f00815e6bc28806b75448c8829f0259d2cb28';
    const filepath = 'widget/cocoa/nsAppShell.mm';
    window.fetch.get(
      `https://hg.mozilla.org/mozilla-central/raw-file/${revision}/${filepath}`,
      stripIndent`
        line 1
        line 2
        line 3
        line 4
        line 5
        line 6
        line 7
      `
    );

    const { profile } = getProfileFromTextSamples(`
      A[file:hg:hg.mozilla.org/mozilla-central:${filepath}:${revision}][line:4]
      B[file:git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b]
      C[lib:libC.so][file:s3:gecko-generated-sources:a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp:]
      D[lib:libD.so]
    `);

    const store = blankStore();
    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-browser',
          search: '',
          hash: '',
        })
      )
    );
    store.dispatch(viewProfile(profile));
    render(
      <Provider store={store}>
        <ProfileViewer />
      </Provider>
    );

    return {
      sourceView: () => document.querySelector('.sourceView'),
    };
  }

  it('does not show the source view at loadtime', () => {
    const { sourceView } = setup();
    expect(sourceView()).not.toBeInTheDocument();
  });

  it('should show the source view when double clicking on a line in the tree view', async () => {
    const { sourceView } = setup();

    const frameElement = screen.getByRole('treeitem', { name: /^A/ });

    fireFullClick(frameElement);
    fireFullClick(frameElement, { detail: 2 });
    expect(sourceView()).toBeInTheDocument();

    const sourceViewElement = ensureExists(sourceView());
    const sourceViewContent = await within(sourceViewElement).findByRole(
      'textbox'
    );

    // Because numbers and strings are split in several element, we're matching
    // on the string "line" only.
    await within(sourceViewContent).findAllByText('line');

    expect(sourceViewContent).toMatchSnapshot();
  });
});
