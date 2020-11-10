/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import type { ElementConfig } from 'react';
import ReactDOM from 'react-dom';
import { ContextMenu as ReactContextMenu } from 'react-contextmenu';

import './ContextMenu.css';

type Props = ElementConfig<typeof ReactContextMenu>;

export class ContextMenu extends PureComponent<Props> {
  _contextMenu: ReactContextMenu | null = null;
  _takeContextMenuRef = (contextMenu: ReactContextMenu | null) => {
    this._contextMenu = contextMenu;
  };

  _mouseDownHandler(event: MouseEvent): void {
    event.preventDefault();
  }

  componentDidMount() {
    if (this._contextMenu) {
      // The context menu component does not expose a reference to its internal
      // DOM node so using findDOMNode is currently unavoidable.
      // eslint-disable-next-line react/no-find-dom-node
      const contextMenuNode = ReactDOM.findDOMNode(this._contextMenu);
      if (contextMenuNode) {
        // There's no need to remove this event listener since the component is
        // never unmounted. Duplicate event listeners will also be discarded
        // automatically so we don't need to handle that.
        contextMenuNode.addEventListener('mousedown', this._mouseDownHandler);
      }
    }
  }

  componentWillUnmount() {
    // eslint-disable-next-line react/no-find-dom-node
    const contextMenuNode = ReactDOM.findDOMNode(this._contextMenu);
    if (contextMenuNode) {
      contextMenuNode.removeEventListener('mousedown', this._mouseDownHandler);
    }
  }

  render() {
    return (
      <ReactContextMenu ref={this._takeContextMenuRef} {...this.props}>
        {this.props.children ? this.props.children : <div />}
      </ReactContextMenu>
    );
  }
}
