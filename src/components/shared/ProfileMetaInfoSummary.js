/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';

import {
  formatProductAndVersion,
  formatPlatform,
} from 'firefox-profiler/profile-logic/profile-metainfo';

import './ProfileMetaInfoSummary.css';

type Props = {
  // We don't use ProfileMeta directly, because this is used also by the stored
  // data in the local IndexedDB, which doesn't use ProfileMeta. Therefore we
  // specify only the properties we use here.
  readonly meta: {
    readonly product: string,
    +misc?: string,
    +platform?: string,
    +oscpu?: string,
    +toolkit?: string,
    ...
  },
};

export function ProfileMetaInfoSummary({ meta }: Props) {
  const productAndVersion = formatProductAndVersion(meta);
  const platform = formatPlatform(meta);
  return (
    <div className="profileMetaInfoSummary">
      <div
        className="profileMetaInfoSummaryProductAndVersion"
        data-product={meta.product}
      >
        {productAndVersion}
      </div>
      <div className="profileMetaInfoSummaryPlatform" data-toolkit={platform}>
        {platform}
      </div>
    </div>
  );
}
