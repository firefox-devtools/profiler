/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';
import { stripIndent } from 'common-tags';

import { ProfileViewer } from 'firefox-profiler/components/app/ProfileViewer';
import { updateUrlState } from 'firefox-profiler/actions/app';
import { viewProfile } from 'firefox-profiler/actions/receive-profile';
import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import { ensureExists } from 'firefox-profiler/utils/types';

import {
  render,
  screen,
  within,
} from 'firefox-profiler/test/fixtures/testing-library';
import { blankStore } from 'firefox-profiler/test/fixtures/stores';
import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { fireFullClick } from 'firefox-profiler/test/fixtures/utils';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect';

// We're not interested in the timeline in this test
jest.mock('../../components/timeline', () => ({
  Timeline: 'custom-timeline',
}));

describe('BottomBox', () => {
  autoMockDomRect();
  afterEach(() => {
    // @ts-expect-error TODO: Our tsconfig includes "DOM" in compilerOptions.lib;
    // maybe tests should not have it in there and instead use jsdom's types?
    delete Range.prototype.getClientRects;
  });

  function setup() {
    // @ts-expect-error see above
    if (Range.prototype.getClientRects) {
      throw new Error(
        'jsdom now implements Range.prototype.getClientRects, please update this test.'
      );
    }

    // @codemirror/view uses getClientRects when scrolling.
    // @ts-expect-error TS2322: Type '() => DOMRect[]' is not assignable to type '() => DOMRectList'.
    Range.prototype.getClientRects = () => {
      return [new DOMRect(0, 0, 1024, 768)];
    };

    const revision = '997f00815e6bc28806b75448c8829f0259d2cb28';
    const filepath = 'widget/cocoa/nsAppShell.mm';
    window.fetchMock
      .post('http://127.0.0.1:8000/source/v1', 500)
      .get(
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
      )
      .post(
        'http://127.0.0.1:8000/asm/v1',
        JSON.stringify({
          startAddress: '0x20',
          size: '0x1a',
          arch: 'x86_64',
          syntax: ['Intel'],
          instructions: [
            [0, 'push rsi'],
            [1, 'push rdi'],
            [2, 'push rbx'],
            [3, 'sub rsp, 0x20'],
            [7, 'mov rsi, rcx'],
            [10, 'mov rdi, qword [rcx + 0x58]'],
            [14, 'mov ebx, edi'],
            [16, 'and ebx, 0x1400'],
            [22, 'call 0x16c5d35'],
          ],
        })
      );

    const { profile } = getProfileFromTextSamples(`
      A[file:hg:hg.mozilla.org/mozilla-central:${filepath}:${revision}][line:4][address:30][sym:Asym:20:1a][lib:libA.so]
      B[file:git:github.com/rust-lang/rust:library/std/src/sys/unix/thread.rs:53cb7b09b00cbea8754ffb78e7e3cb521cb8af4b]
      C[lib:libC.so][file:s3:gecko-generated-sources:a5d3747707d6877b0e5cb0a364e3cb9fea8aa4feb6ead138952c2ba46d41045297286385f0e0470146f49403e46bd266e654dfca986de48c230f3a71c2aafed4/ipc/ipdl/PBackgroundChild.cpp:]
      D[lib:libD.so]
    `);

    const store = blankStore();
    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-browser',
          search: '?symbolServer=http://127.0.0.1:8000',
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
      sourceView: () => document.querySelector('.sourceView') as HTMLElement,
      assemblyView: () =>
        document.querySelector('.assemblyView') as HTMLElement,
    };
  }

  it('does not show the source view at loadtime', () => {
    const { sourceView, assemblyView } = setup();
    expect(sourceView()).not.toBeInTheDocument();
    expect(assemblyView()).not.toBeInTheDocument();
  });

  it('should show the source view when a line in the tree view is double-clicked', async () => {
    const { sourceView, assemblyView } = setup();

    const frameElement = screen.getByRole('treeitem', { name: /^A/ });

    fireFullClick(frameElement);
    fireFullClick(frameElement, { detail: 2 });
    expect(sourceView()).toBeInTheDocument();
    expect(assemblyView()).not.toBeInTheDocument();

    const sourceViewElement = ensureExists(sourceView());
    const sourceViewContent =
      await within(sourceViewElement).findByRole('textbox');

    // Because numbers and strings are split in several element, we're matching
    // on the string "line" only.
    await within(sourceViewContent).findAllByText('line');

    expect(sourceViewContent).toMatchSnapshot();
  });

  it('should show the assembly view when pressing the toggle button', async () => {
    const { sourceView, assemblyView } = setup();

    const frameElement = screen.getByRole('treeitem', { name: /^A/ });

    fireFullClick(frameElement);
    fireFullClick(frameElement, { detail: 2 });
    expect(sourceView()).toBeInTheDocument();
    expect(assemblyView()).not.toBeInTheDocument();

    const asmViewShowButton = ensureExists(
      document.querySelector('.bottom-assembly-button')
    ) as HTMLElement;
    fireFullClick(asmViewShowButton);

    expect(sourceView()).toBeInTheDocument();
    expect(assemblyView()).toBeInTheDocument();

    const assemblyViewElement = ensureExists(assemblyView());
    const assemblyViewContent =
      await within(assemblyViewElement).findByRole('textbox');

    // Find one of the instructions. Once we have assembly syntax highlighting,
    // we'll probably have to match on a smaller string.
    await within(assemblyViewContent).findAllByText(
      'mov rdi, qword [rcx + 0x58]'
    );

    expect(assemblyViewContent).toMatchSnapshot();

    // Click the toggle button again and make sure the assembly view hides.
    const asmViewHideButton = ensureExists(
      document.querySelector('.bottom-assembly-button')
    ) as HTMLElement;
    fireFullClick(asmViewHideButton);

    expect(assemblyView()).not.toBeInTheDocument();
  });
});
