/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import type { ComponentProps } from 'react';
import { ContextMenu as ReactContextMenu } from '@firefox-devtools/react-contextmenu';

import './ContextMenu.css';

type Props = ComponentProps<typeof ReactContextMenu>;

export class ContextMenu extends PureComponent<Props> {
  _mouseDownHandler = (event: React.MouseEvent<HTMLDivElement>): void => {
    // This prevents from stealing the focus from where it was.
    event.preventDefault();
  };

  override render() {
    return (
      <div onMouseDown={this._mouseDownHandler}>
        <ReactContextMenu {...this.props}>
          {this.props.children ? this.props.children : <div />}
        </ReactContextMenu>
      </div>
    );
  }
}
