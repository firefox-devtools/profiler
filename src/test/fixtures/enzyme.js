/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { shallow } from 'enzyme';

import type { Element } from 'react';
import type { Store } from '../../types/store';

/**
 * This is a wrapping function for enzyme's shallow render mechanism. It is used
 * to easily provide a Redux store to the rendered element, because using
 * react-redux' Provider component doesn't work in this mode.
 * react-redux' connect takes the store from React's context (this is what
 * <Provider> does really), and we're providing it there as well.
 *
 * Note that the element is the ConnectedElement, so when it's rendered
 * shallowly we only see that it renders the WrappedElement. So when testing you
 * need to call `.dive()` on the returned component so that you can actually
 * test the underlying component.
 *
 * You still need to keep a reference to the returned component to be able to
 * `update` it after store changes. Indeed the underlying component doesn't have
 * any reference to the store, only the connected component does.
 *
 * Example:
 * ```
 * const store = storeWithProfile(profile);
 * const view = shallowWithStore(<ProfileViewerContainer />, store);
 * expect(view.dive()).toMatchSnapshot();
 *
 * // update the store, then update before testing
 * store.dispatch(someAction());
 * view.update();
 * expect(view.dive()).toMatchSnapshot();
 * ```
 */
export function shallowWithStore(element: Element<any>, store: Store): * {
  return shallow(element, { context: { store } });
}
