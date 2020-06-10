/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  getProfileWithBalancedNativeAllocations,
  getProfileWithUnbalancedNativeAllocations,
} from '../fixtures/profiles/processed-profile';
import { formatTree } from '../fixtures/utils';
import { storeWithProfile } from '../fixtures/stores';
import {
  changeCallTreeSummaryStrategy,
  changeCallTreeSearchString,
  changeInvertCallstack,
  changeImplementationFilter,
  commitRange,
  updatePreviewSelection,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import type { CallTreeSummaryStrategy } from 'firefox-profiler/types/actions';

/**
 * Test that the NativeAllocationTable structure can by used with all of the call tree
 * functionality, and that it obeys all of the transformation pipeline.
 */
describe('Native allocation call trees', function() {
  function setup(
    type: 'balanced' | 'unbalanced',
    summaryStrategy: CallTreeSummaryStrategy
  ) {
    const { profile, funcNamesDict } =
      type === 'balanced'
        ? getProfileWithBalancedNativeAllocations()
        : getProfileWithUnbalancedNativeAllocations();

    // Create the store and switch to the summary view.
    const store = storeWithProfile(profile);
    store.dispatch(changeCallTreeSummaryStrategy(summaryStrategy));
    return { ...store, funcNamesDict };
  }

  describe('with balanced allocations', function() {
    it('can create a call tree from allocations only', function() {
      const { getState } = setup('balanced', 'native-allocations');
      const callTree = selectedThreadSelectors.getCallTree(getState());

      expect(formatTree(callTree)).toEqual([
        '- A (total: 56, self: —)',
        '  - B (total: 56, self: —)',
        '    - Fjs (total: 42, self: —)',
        '      - Gjs (total: 42, self: 18)',
        '        - Hjs (total: 24, self: —)',
        '          - I (total: 24, self: 24)',
        '    - C (total: 14, self: —)',
        '      - D (total: 14, self: —)',
        '        - E (total: 14, self: 14)',
      ]);
    });

    it('can create a call tree from deallocation sites only', function() {
      const { getState } = setup('balanced', 'native-deallocations-sites');
      const callTree = selectedThreadSelectors.getCallTree(getState());

      expect(formatTree(callTree)).toEqual([
        '- A (total: -86, self: —)',
        '  - B (total: -86, self: —)',
        '    - Fjs (total: -64, self: —)',
        '      - Gjs (total: -64, self: -28)',
        '        - Hjs (total: -36, self: —)',
        '          - I (total: -36, self: -36)',
        '    - C (total: -22, self: —)',
        '      - D (total: -22, self: —)',
        '        - E (total: -22, self: -22)',
      ]);
    });

    it('can create a call tree from deallocated memory', function() {
      const { getState } = setup('balanced', 'native-deallocations-memory');
      const callTree = selectedThreadSelectors.getCallTree(getState());

      expect(formatTree(callTree)).toEqual([
        '- A (total: -15, self: -3)',
        '  - B (total: -12, self: -5)',
        '    - C (total: -7, self: -7)',
      ]);
    });

    it('can create a call tree from retained allocations', function() {
      const { getState } = setup('balanced', 'native-retained-allocations');
      const callTree = selectedThreadSelectors.getCallTree(getState());

      expect(formatTree(callTree)).toEqual([
        '- A (total: 41, self: —)',
        '  - B (total: 41, self: —)',
        '    - Fjs (total: 30, self: —)',
        '      - Gjs (total: 30, self: 13)',
        '        - Hjs (total: 17, self: —)',
        '          - I (total: 17, self: 17)',
        '    - C (total: 11, self: —)',
        '      - D (total: 11, self: —)',
        '        - E (total: 11, self: 11)',
      ]);
    });
  });

  describe('with unbalanced allocations', function() {
    it('can create a call tree from allocations only', function() {
      const { getState } = setup('unbalanced', 'native-allocations');
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

    it('can create a call tree from deallocations only', function() {
      const { getState } = setup('unbalanced', 'native-deallocations-sites');
      const callTree = selectedThreadSelectors.getCallTree(getState());

      expect(formatTree(callTree)).toEqual([
        '- A (total: -41, self: —)',
        '  - B (total: -41, self: —)',
        '    - Fjs (total: -30, self: —)',
        '      - Gjs (total: -30, self: -13)',
        '        - Hjs (total: -17, self: —)',
        '          - I (total: -17, self: -17)',
        '    - C (total: -11, self: —)',
        '      - D (total: -11, self: —)',
        '        - E (total: -11, self: -11)',
      ]);
    });

    it('cannot create a call tree from retained allocations', function() {
      const { getState } = setup('unbalanced', 'native-retained-allocations');
      expect(() => {
        selectedThreadSelectors.getCallTree(getState());
      }).toThrow();
    });
  });

  it('can search the allocations', function() {
    const { getState, dispatch } = setup('balanced', 'native-allocations');
    dispatch(changeCallTreeSearchString('Hjs'));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- A (total: 24, self: —)',
      '  - B (total: 24, self: —)',
      '    - Fjs (total: 24, self: —)',
      '      - Gjs (total: 24, self: —)',
      '        - Hjs (total: 24, self: —)',
      '          - I (total: 24, self: 24)',
    ]);
  });

  it('can invert the allocation tree', function() {
    const { getState, dispatch } = setup('balanced', 'native-allocations');
    dispatch(changeInvertCallstack(true));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- I (total: 24, self: 24)',
      '  - Hjs (total: 24, self: —)',
      '    - Gjs (total: 24, self: —)',
      '      - Fjs (total: 24, self: —)',
      '        - B (total: 24, self: —)',
      '          - A (total: 24, self: —)',
      '- Gjs (total: 18, self: 18)',
      '  - Fjs (total: 18, self: —)',
      '    - B (total: 18, self: —)',
      '      - A (total: 18, self: —)',
      '- E (total: 14, self: 14)',
      '  - D (total: 14, self: —)',
      '    - C (total: 14, self: —)',
      '      - B (total: 14, self: —)',
      '        - A (total: 14, self: —)',
    ]);
  });

  it('can use an implementation filter', function() {
    const { getState, dispatch } = setup('balanced', 'native-allocations');
    dispatch(changeImplementationFilter('js'));
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- Fjs (total: 42, self: —)',
      '  - Gjs (total: 42, self: 18)',
      '    - Hjs (total: 24, self: 24)',
    ]);
  });

  it('will apply a committed range selection', function() {
    const { getState, dispatch } = setup('balanced', 'native-allocations');

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

  it('will apply a preview selection', function() {
    const { getState, dispatch } = setup('balanced', 'native-allocations');

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
