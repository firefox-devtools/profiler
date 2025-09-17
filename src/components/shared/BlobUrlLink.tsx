/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { useState, useEffect } from 'react';

type Props = {
  readonly blob: Blob;
  readonly children: React.ReactNode;
} & React.HTMLProps<HTMLAnchorElement>;

/**
 * This component is responsible for converting a Blob into an
 * ObjectUrl. The ObjectUrl strings are not GCed, so this component
 * does the proper thing of cleaning up after itself as the component
 * is mounted, updated, and unmounted.
 */
export const BlobUrlLink = ({ blob, children, ...linkProps }: Props) => {
  const [blobUrl, setBlobUrl] = useState('');

  useEffect(() => {
    const newUrl = URL.createObjectURL(blob);
    setBlobUrl(newUrl);
    return () => URL.revokeObjectURL(newUrl);
  }, [blob]);

  // This component must be an <a> rather than a <button> as the download attribute
  // allows users to download the profile.
  return (
    <a href={blobUrl} {...linkProps}>
      {children}
    </a>
  );
};
