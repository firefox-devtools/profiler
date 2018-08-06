/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import EventEmitter from 'events';
import type { PreviewSelection } from '../types/actions';

export class FastPreviewSelection extends EventEmitter {
  _previewSelection: PreviewSelection;

  constructor(initialPreviewSelection: PreviewSelection) {
    super();
    this._previewSelection = initialPreviewSelection;
  }

  get(): PreviewSelection {
    return this._previewSelection;
  }

  update(previewSelection: PreviewSelection): void {
    this._previewSelection = previewSelection;
    this.emit('update', previewSelection);
  }
}
