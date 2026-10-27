/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';
import { ChatErrorMessage } from './ChatTranscript';
import type { ChatError } from 'firefox-profiler/types';

type Props = {
  readonly error: ChatError | null;
  readonly onSave: (apiKey: string) => void;
};

export function ChatApiKeyForm({ error, onSave }: Props) {
  const [apiKey, setApiKey] = React.useState('');
  const onSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = apiKey.trim();
      if (trimmed !== '') {
        onSave(trimmed);
      }
    },
    [apiKey, onSave]
  );
  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setApiKey(event.target.value),
    []
  );

  return (
    <form className="chatApiKeyForm" onSubmit={onSubmit}>
      <Localized
        id="ChatApiKeyForm--description"
        elems={{
          a: (
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
        }}
      >
        <p>
          Enter an <a>Anthropic API key</a> to ask questions about this profile.
        </p>
      </Localized>
      <Localized id="ChatApiKeyForm--privacy-warning">
        <p className="chatApiKeyFormWarning">
          The key is stored in this browser only. Your questions and the parts
          of the profile needed to answer them, such as function names, URLs and
          marker data, are sent to Anthropic.
        </p>
      </Localized>
      {error !== null ? <ChatErrorMessage error={error} /> : null}
      <Localized id="ChatApiKeyForm--input" attrs={{ placeholder: true }}>
        <input
          className="chatApiKeyFormInput photon-input"
          type="password"
          autoComplete="off"
          placeholder="Anthropic API key"
          value={apiKey}
          onChange={onChange}
        />
      </Localized>
      <Localized id="ChatApiKeyForm--save-button">
        <button
          className="photon-button photon-button-primary"
          type="submit"
          disabled={apiKey.trim() === ''}
        >
          Save key
        </button>
      </Localized>
    </form>
  );
}
