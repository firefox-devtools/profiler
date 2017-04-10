import { assert } from 'chai';
import iconsStateReducers, * as icons from '../../icons';

describe('content/reducers/icons', function () {
  const validIcon = 'https://valid.icon.example.org/favicon.ico';
  const invalidIcon = 'https://invalid.icon.example.org/favicon.ico';

  describe('reducer', function () {
    it('has an expected default value', function () {
      const initialState = iconsStateReducers(undefined, 'unknown_action');
      assert.typeOf(initialState, 'set');
      assert.equal(initialState.size, 0);
    });

    it('react to action ICON_HAS_LOADED', function () {
      const action = {
        type: 'ICON_HAS_LOADED',
        icon: validIcon,
      };
      const state = iconsStateReducers(undefined, action);
      assert.typeOf(state, 'set');
      assert.equal(state.size, 1);
      assert.isTrue(state.has(action.icon));
    });

    it('does not react to action ICON_IN_ERROR', function () {
      const action = {
        type: 'ICON_IN_ERROR',
        icon: invalidIcon,
      };
      const state = iconsStateReducers(undefined, action);
      assert.typeOf(state, 'set');
      assert.equal(state.size, 0);
      assert.isFalse(state.has(action.icon));
    });
  });

  describe('accessors', function () {
    let state;
    const expectedClass = 'https___valid_icon_example_org_favicon_ico';

    beforeEach(function () {
      state = {
        icons: new Set([validIcon]),
      };
    });

    it('getIcons', function () {
      assert.equal(icons.getIcons(state), state.icons);
    });

    it('getIconForNode', function () {
      const subject = icons.getIconForNode(state, { icon: validIcon });
      assert.equal(subject, validIcon);
    });

    it('getIconClassNameForNode', function () {
      let subject = icons.getIconClassNameForNode(state, { icon: validIcon });
      assert.equal(subject, expectedClass);

      subject = icons.getIconClassNameForNode(state, { icon: invalidIcon });
      assert.isNull(subject);
    });

    it('getIconsWithClassNames', function () {
      const subject = icons.getIconsWithClassNames(state);
      const expected = [{ icon: validIcon, className: expectedClass }];
      assert.deepEqual(subject, expected);
    });
  });
});
