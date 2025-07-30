/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  ContextMenu,
  hideMenu as hideContextMenu,
} from '@firefox-devtools/react-contextmenu';

/**
 * This is a context menu component with adjusted hide menu behavior.
 * This implementation changes the behavior of the extended ContextMenu component
 * slightly by overriding the hideMenu method. For some context menus, we don't
 * want enter key to close the context menu completely because we would like to
 * select multiple items in a row without closing the context menu with it.
 */
export class ContextMenuNoHidingOnEnter extends ContextMenu {
  /**
   * This hideMenu method is the overriden version of the ContextMenu component.
   * See the original function here:
   * https://github.com/vkbansal/react-contextmenu/blob/d9018dbfbd6e21423cb2b753b3762adf5a6d77b0/src/ContextMenu.js#L156-L160
   */
  hideMenu = (e: KeyboardEvent) => {
    // Differently, we are only checking for the ESC key instead of both ESC and enter.
    if (e.keyCode === 27) {
      hideContextMenu();
    }
  };
}