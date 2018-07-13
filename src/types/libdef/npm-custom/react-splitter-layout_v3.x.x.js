/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// copied from https://github.com/flowtype/flow-typed/pull/2063
declare type $$reactsplitterlayout$$Props = {|
  +customClassName?: string,
  +vertical?: boolean,
  +percentage?: boolean,
  +primaryIndex?: 0 | 1,
  +primaryMinSize?: number,
  +secondaryMinSize?: number,
  +secondaryInitialSize?: number,
  +onDragStart?: () => mixed,
  +onDragEnd?: () => mixed,
  +onSecondaryPaneSizeChange?: number => mixed,
  +children: React$Node,
|};

declare module 'react-splitter-layout' {
  declare export default React$ComponentType<$$reactsplitterlayout$$Props>
}
