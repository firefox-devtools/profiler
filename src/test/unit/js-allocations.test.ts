/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getProfileWithJsAllocations } from '../fixtures/profiles/processed-profile';
import { formatTree } from '../fixtures/utils';
import { storeWithProfile } from '../fixtures/stores';
import {
  changeCallTreeSummaryStrategy,
  changeCallTreeSearchString,
  changeInvertCallstack,
  changeImplementationFilter,
  addTransformToStack,
  commitRange,
  updatePreviewSelection,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';

/**
 * Test that the JsAllocationTable structure can by used with all of the call tree
 * functionality, and that it obeys all of the transformation pipeline.
 */
describe('JS allocation call trees', function () {
  function setup() {
    const { profile, funcNamesDict } = getProfileWithJsAllocations();

    // Create the store and switch to the JS allocations view.
    const store = storeWithProfile(profile);
    store.dispatch(changeCallTreeSummaryStrategy('js-allocations'));
    return { ...store, funcNamesDict };
  }

  it('can create a call tree from JS allocations', function () {
    const { getState } = setup();
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- A (total: 15, self: —)',
      '  - B (total: 15, self: —)',
      '    - Fjs (total: 12, self: —)',
      '      - Gjs (total: 12, self: 5)',
      '        - Hjs (total: 7, self: —)',
      '          - I (total: 7, self: 7)',
      '    - C (total: 3, self: —)',
      '      - D (total: 3, self: —)',
      '        - E (total: 3, self: 3)',
    ]);
  });

  it('can search the allocations', function () {
    const { getState, dispatch } = setup();
    dispatch(changeCallTreeSearchString('H'));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- A (total: 7, self: —)',
      '  - B (total: 7, self: —)',
      '    - Fjs (total: 7, self: —)',
      '      - Gjs (total: 7, self: —)',
      '        - Hjs (total: 7, self: —)',
      '          - I (total: 7, self: 7)',
    ]);
  });

  it('can invert the allocation tree', function () {
    const { getState, dispatch } = setup();
    dispatch(changeInvertCallstack(true));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- I (total: 7, self: 7)',
      '  - Hjs (total: 7, self: —)',
      '    - Gjs (total: 7, self: —)',
      '      - Fjs (total: 7, self: —)',
      '        - B (total: 7, self: —)',
      '          - A (total: 7, self: —)',
      '- Gjs (total: 5, self: 5)',
      '  - Fjs (total: 5, self: —)',
      '    - B (total: 5, self: —)',
      '      - A (total: 5, self: —)',
      '- E (total: 3, self: 3)',
      '  - D (total: 3, self: —)',
      '    - C (total: 3, self: —)',
      '      - B (total: 3, self: —)',
      '        - A (total: 3, self: —)',
    ]);
  });

  it('can use an implementation filter', function () {
    const { getState, dispatch } = setup();
    dispatch(changeImplementationFilter('js'));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- Fjs (total: 12, self: —)',
      '  - Gjs (total: 12, self: 5)',
      '    - Hjs (total: 7, self: 7)',
    ]);
  });

  /**
   * This test doesn't go through every single call tree transform, but lightly
   * checks out the merge function transform, since the transforms should all go
   * through the same stack updating path. This test only checks that one is correctly
   * wired up.
   */
  it('can apply a call tree transform', function () {
    const {
      getState,
      dispatch,
      funcNamesDict: { C },
    } = setup();
    dispatch(
      addTransformToStack(0, {
        type: 'merge-function',
        funcIndex: C,
      })
    );

    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- A (total: 15, self: —)',
      '  - B (total: 15, self: —)',
      '    - Fjs (total: 12, self: —)',
      '      - Gjs (total: 12, self: 5)',
      '        - Hjs (total: 7, self: —)',
      '          - I (total: 7, self: 7)',
      '    - D (total: 3, self: —)',
      '      - E (total: 3, self: 3)',
    ]);
  });

  it('will apply a committed range selection', function () {
    const { getState, dispatch } = setup();

    dispatch(commitRange(0, 1.5));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- A (total: 8, self: —)',
      '  - B (total: 8, self: —)',
      '    - Fjs (total: 5, self: —)',
      '      - Gjs (total: 5, self: 5)',
      '    - C (total: 3, self: —)',
      '      - D (total: 3, self: —)',
      '        - E (total: 3, self: 3)',
    ]);
  });

  it('will apply a preview selection', function () {
    const { getState, dispatch } = setup();

    dispatch(commitRange(0, 1.5));
    dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: 0,
        selectionEnd: 1,
      })
    );
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- A (total: 3, self: —)',
      '  - B (total: 3, self: —)',
      '    - C (total: 3, self: —)',
      '      - D (total: 3, self: —)',
      '        - E (total: 3, self: 3)',
    ]);
  });
});
