/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CallTree } from './CallTree';
import { StackSettings } from 'firefox-profiler/components/shared/StackSettings';
import { TransformNavigator } from 'firefox-profiler/components/shared/TransformNavigator';

type Props = {
  readonly filterScrollPos?: number;
  readonly setFilterScrollPos?: (pos: number) => void;
};

export const ProfileCallTreeView = (props: Props) => (
  <div
    className="treeAndSidebarWrapper"
    id="calltree-tab"
    role="tabpanel"
    aria-labelledby="calltree-tab-button"
  >
    <StackSettings />
    <TransformNavigator
      filterScrollPos={props.filterScrollPos}
      setFilterScrollPos={props.setFilterScrollPos}
    />
    <CallTree />
  </div>
);
