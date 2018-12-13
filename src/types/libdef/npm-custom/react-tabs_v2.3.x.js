/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

declare type $$reacttab$$Props = {
  +className?: string | Array<string> | { [string]: boolean },
  +defaultFocus?: boolean,
  +defaultIndex?: number,
  +disabledTabClassName?: string,
  +domRef?: mixed,
  +forceRenderTabPanel?: boolean,
  +onSelect?: (index: number, lastIndex: number, event: Event) => ?boolean,
  +selectedIndex?: number,
  +selectedTabClassName?: string,
  +selectedTabPanelClassName?: string,
  +children?: React$Node,
};

declare type $$reacttabs$$Props = {
  +className?: string | Array<string> | { [string]: boolean },
  +disabled?: boolean,
  +disabledClassName?: string,
  +selectedClassName?: string,
  +tabIndex?: string,
  +children?: React$Node,
};

declare type $$reacttablist$$Props = {
  +className?: string | Array<string> | { [string]: boolean },
  +children?: React$Node,
};

declare type $$reacttabpanel$$Props = {
  +className?: string | Array<string> | { [string]: boolean },
  +forceRender?: boolean,
  +selectedClassName?: string,
  +children?: React$Node,
};

declare module 'react-tabs' {
  declare export class Tab extends React$Component<$$reacttab$$Props> {}
  declare export class Tabs extends React$Component<$$reacttabs$$Props> {}
  declare export class TabList extends React$Component<$$reacttablist$$Props> {}
  declare export class TabPanel extends React$Component<
    $$reacttabpanel$$Props
  > {}
}
