/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {
  readonly onShow: () => void;
  readonly onHide: () => void;
  readonly onCopy: (format: 'plain' | 'markdown') => void;
};

type Props = ConnectedProps<OwnProps, {}, {}>;

class MarkerCopyTableContextMenuImpl extends PureComponent<Props> {
  copyAsPlain = () => {
    const { onCopy } = this.props;
    onCopy('plain');
  };

  copyAsMarkdown = () => {
    const { onCopy } = this.props;
    onCopy('markdown');
  };

  override render() {
    const { onShow, onHide } = this.props;
    return (
      <ContextMenu
        id="MarkerCopyTableContextMenu"
        className="markerCopyTableContextMenu"
        onShow={onShow}
        onHide={onHide}
      >
        <MenuItem onClick={this.copyAsPlain}>
          <Localized id="MarkerCopyTableContextMenu--copy-table-as-plain">
            Copy marker table as plain text
          </Localized>
        </MenuItem>
        <MenuItem onClick={this.copyAsMarkdown}>
          <Localized id="MarkerCopyTableContextMenu--copy-table-as-markdown">
            Copy marker table as Markdown
          </Localized>
        </MenuItem>
      </ContextMenu>
    );
  }
}

export const MarkerCopyTableContextMenu = explicitConnect<OwnProps, {}, {}>({
  component: MarkerCopyTableContextMenuImpl,
});
