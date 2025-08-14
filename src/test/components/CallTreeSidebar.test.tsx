/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import { CallTreeSidebar } from '../../components/sidebar/CallTreeSidebar';
import {
  changeSelectedCallNode,
  changeInvertCallstack,
} from '../../actions/profile-view';

import { storeWithProfile } from '../fixtures/stores';
import type { FuncNamesDict } from '../fixtures/profiles/processed-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import type { CallNodePath, Profile } from 'firefox-profiler/types';
import { ensureExists } from '../../utils/types';
import { fireFullClick } from '../fixtures/utils';

describe('CallTreeSidebar', function () {
  function getProfileWithCategories() {
    return getProfileFromTextSamples(`
      A    A    A              A
      B    B    B              B
      Cjs  Cjs  H[cat:Layout]  H[cat:Layout]
      D    F    I[cat:Idle]
      Ejs  Ejs
    `);
  }

  function getProfileWithSubCategories() {
    const result = getProfileFromTextSamples(`
      A              A              A
      B              B              B
      C[cat:Layout]  C[cat:Layout]  C[cat:Layout]
                                    D[cat:Layout]
    `);

    const {
      profile,
      funcNamesDictPerThread: [{ C, D }],
    } = result;
    const layout = ensureExists(
      ensureExists(
        profile.meta.categories,
        'Expected to find categories.'
      ).find((category) => category.name === 'Layout'),
      'Could not find Layout category.'
    );
    const [{ frameTable }] = profile.threads;
    const fakeC = layout.subcategories.length;
    layout.subcategories.push('FakeSubCategoryC');
    const fakeD = layout.subcategories.length;
    layout.subcategories.push('FakeSubCategoryD');

    // The frames, funcs, and stacks all share the same indexes with the layout
    // of the stacks.
    frameTable.subcategory[C] = fakeC;
    frameTable.subcategory[D] = fakeD;

    return result;
  }

  function setup({
    profile,
    funcNamesDictPerThread,
  }: {
    profile: Profile;
    funcNamesDictPerThread: FuncNamesDict[];
  }) {
    const store = storeWithProfile(profile);

    const selectNode = (nodePath: CallNodePath) => {
      act(() => {
        store.dispatch(changeSelectedCallNode(0, nodePath));
      });
    };

    const invertCallstack = () =>
      act(() => store.dispatch(changeInvertCallstack(true)));

    const renderResult = render(
      <Provider store={store}>
        <CallTreeSidebar />
      </Provider>
    );

    const rerenderContainer = () =>
      renderResult.rerender(
        <Provider store={store}>
          <CallTreeSidebar />
        </Provider>
      );

    return {
      ...renderResult,
      rerenderContainer,
      ...store,
      funcNamesDict: funcNamesDictPerThread[0],
      selectNode,
      invertCallstack,
    };
  }

  it('matches the snapshots when displaying data about the currently selected node', () => {
    const {
      selectNode,
      funcNamesDict: { A, B, Cjs, D, H, Ejs },
      container,
    } = setup(getProfileWithCategories());

    expect(container.firstChild).toMatchSnapshot();

    // Cjs is a JS node, but has no self time, so we shouldn't see the
    // implementation information.
    selectNode([A, B, Cjs]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, Cjs, D]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, H]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, Cjs, D, Ejs]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshots when displaying bytes data', () => {
    const profileWithDicts = getProfileWithCategories();
    // Create a weighted samples table with bytes.
    const [{ samples }] = profileWithDicts.profile.threads;
    samples.weightType = 'bytes';
    samples.weight = samples.stack.map((_stack, i) => i);

    const {
      selectNode,
      funcNamesDict: { A, B, Cjs },
      container,
    } = setup(profileWithDicts);

    expect(container.firstChild).toMatchSnapshot();

    selectNode([A, B, Cjs]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshots when displaying data about the currently selected node in an inverted tree', () => {
    const {
      selectNode,
      invertCallstack,
      funcNamesDict: { A, B, H, Ejs, I },
      container,
    } = setup(getProfileWithCategories());

    invertCallstack();
    expect(container.firstChild).toMatchSnapshot();

    selectNode([Ejs]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([H]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([I, H]);
    expect(container.firstChild).toMatchSnapshot();

    selectNode([H, B, A]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('can expand subcategories', () => {
    const {
      selectNode,
      container,
      queryByText,
      getAllByText,
      funcNamesDict: { A, B, C },
      rerenderContainer,
    } = setup(getProfileWithSubCategories());
    selectNode([A, B, C]);
    expect(queryByText('FakeSubCategoryC')).not.toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();

    const layoutCategory = getAllByText('Layout')[0];

    fireFullClick(layoutCategory);
    rerenderContainer();

    expect(getAllByText('FakeSubCategoryC')[0]).toBeInTheDocument();
    // only the 'Layout' category for the total running samples is expanded,
    // not the other one too
    expect(getAllByText('FakeSubCategoryC').length).toBe(1);

    expect(container.firstChild).toMatchSnapshot();

    const layoutCategory2 = getAllByText('Layout')[1];

    fireFullClick(layoutCategory2);
    rerenderContainer();

    expect(getAllByText('FakeSubCategoryC')[0]).toBeInTheDocument();
    expect(getAllByText('FakeSubCategoryC')[1]).toBeInTheDocument();
  });
});
