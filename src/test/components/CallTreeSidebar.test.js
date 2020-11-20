/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { CallTreeSidebar } from '../../components/sidebar/CallTreeSidebar';
import {
  changeSelectedCallNode,
  changeInvertCallstack,
  changeSelectedThreads,
} from '../../actions/profile-view';

import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileFromTextSamples,
  getMergedProfileFromTextSamples,
} from '../fixtures/profiles/processed-profile';

import type { CallNodePath } from 'firefox-profiler/types';
import { ensureExists } from '../../utils/flow';
import { fireFullClick } from '../fixtures/utils';

describe('CallTreeSidebar', function() {
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
      profile.meta.categories.find(category => category.name === 'Layout'),
      'Could not find Layout category.'
    );
    const [{ frameTable, stackTable }] = profile.threads;
    const fakeC = layout.subcategories.length;
    layout.subcategories.push('FakeSubCategoryC');
    const fakeD = layout.subcategories.length;
    layout.subcategories.push('FakeSubCategoryD');

    // The frames, funcs, and stacks all share the same indexes with the layout
    // of the stacks.
    frameTable.subcategory[C] = fakeC;
    frameTable.subcategory[D] = fakeD;
    stackTable.subcategory[C] = fakeC;
    stackTable.subcategory[D] = fakeD;

    return result;
  }

  function setup({ profile, funcNamesDictPerThread }) {
    const store = storeWithProfile(profile);

    const selectNode = (nodePath: CallNodePath) => {
      store.dispatch(changeSelectedCallNode(0, nodePath));
    };

    const invertCallstack = () => store.dispatch(changeInvertCallstack(true));

    const renderResult = render(
      <Provider store={store}>
        <CallTreeSidebar />
      </Provider>
    );
    return {
      ...renderResult,
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

  it("doesn't show implementation breakdowns when self and total time in profile is zero", () => {
    const {
      dispatch,
      queryByText,
      getAllByText,
      funcNamesDict: { A, B, D },
    } = setup(
      getMergedProfileFromTextSamples(
        `
          A  A  A
          B  B  C
          D  E  F
        `,
        `
          A  A  A
          B  B  B
          G  I  E
        `
      )
    );

    dispatch(changeSelectedThreads(new Set([2])));
    dispatch(changeSelectedCallNode(2, [A]));

    expect(queryByText(/Implementation/)).toBe(null);

    dispatch(changeSelectedCallNode(2, [A, B, D]));
    expect(getAllByText(/Implementation/).length).toBeGreaterThan(0);
  });

  it('can expand subcategories', () => {
    const {
      selectNode,
      container,
      queryByText,
      getByText,
      funcNamesDict: { A, B, C },
    } = setup(getProfileWithSubCategories());
    selectNode([A, B, C]);
    expect(queryByText('FakeSubCategoryC')).toBe(null);

    const layoutCategory = getByText('Layout');
    fireFullClick(layoutCategory);

    expect(getByText('FakeSubCategoryC')).toBeTruthy();

    expect(container.firstChild).toMatchSnapshot();
  });
});
