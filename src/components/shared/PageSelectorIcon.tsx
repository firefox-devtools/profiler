/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Icon } from './Icon';
import ExtensionFavicon from '../../../res/img/svg/extension-outline.svg';
import DefaultLinkFavicon from '../../../res/img/svg/globe.svg';

type Props = {
  readonly favicon: string | null;
  readonly origin: string;
};

/**
 * PageSelectorIcon wraps the Icon component and provides fallback icons
 * for pages that don't have a favicon in the profile data.
 *
 * Fallback logic:
 * - If favicon exists (Firefox 134+ provides base64 data URI), use it
 * - If origin is moz-extension://, fallback to extension-outline.svg
 * - Otherwise (regular pages, about: pages), fallback to globe.svg
 */
export function PageSelectorIcon({ favicon, origin }: Props) {
  const iconUrl =
    favicon ??
    (origin.startsWith('moz-extension://')
      ? ExtensionFavicon
      : DefaultLinkFavicon);

  return <Icon iconUrl={iconUrl} />;
}
