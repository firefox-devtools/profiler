/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';

import {
  formatProductAndVersion,
  formatPlatform,
} from '../../profile-logic/profile-metainfo';

import './ProfileMetainfoSummary.css';

type Props = {|
  +meta: {
    +product: string,
    +misc?: string,
    +platform?: string,
    +oscpu?: string,
    +toolkit?: string,
    ...
  },
|};

export function ProfileMetainfoSummary({ meta }: Props) {
  const productAndVersion = formatProductAndVersion(meta);
  const platform = formatPlatform(meta);
  return (
    <div className="profileMetainfoSummary">
      <div
        className="profileMetainfoSummaryProductAndVersion"
        data-product={meta.product}
      >
        {productAndVersion}
      </div>
      <div className="profileMetainfoSummaryPlatform" data-toolkit={platform}>
        {platform}
      </div>
    </div>
  );
}
