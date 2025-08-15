/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { Localized } from '@fluent/react';
import type { CodeLoadingSource } from 'firefox-profiler/types/state';

type CodeLoadingOverlayProps = {
  source: CodeLoadingSource;
};

export function CodeLoadingOverlay({ source }: CodeLoadingOverlayProps) {
  switch (source.type) {
    case 'URL': {
      const { url } = source;
      let host;
      try {
        host = new URL(url).host;
      } catch (e) {
        host = url;
      }
      return (
        <Localized id="SourceView--loading-url" vars={{ host }}>
          <div className="codeLoadingOverlay">{`Waiting for ${host}…`}</div>
        </Localized>
      );
    }
    case 'BROWSER_CONNECTION': {
      return (
        <Localized id="SourceView--loading-browser-connection">
          <div className="codeLoadingOverlay">Waiting for browser…</div>
        </Localized>
      );
    }
    default:
      throw assertExhaustiveCheck(source);
  }
}

export default CodeLoadingOverlay;
