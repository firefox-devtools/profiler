/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';

type Props = {
  readonly isTurnRunning: boolean;
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly onSend: (text: string) => void;
  readonly onStop: () => void;
};

export function ChatComposer({
  isTurnRunning,
  text,
  onTextChange,
  onSend,
  onStop,
}: Props) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = React.useCallback(() => {
    const trimmed = text.trim();
    if (trimmed === '' || isTurnRunning) {
      return;
    }
    onSend(trimmed);
    onTextChange('');
  }, [text, isTurnRunning, onSend, onTextChange]);

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      onTextChange(event.target.value),
    [onTextChange]
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends, Shift+Enter inserts a new line.
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        send();
      }
    },
    [send]
  );

  return (
    <div className="chatComposer">
      <div className="chatComposerBox">
        <Localized id="ChatComposer--input" attrs={{ placeholder: true }}>
          <textarea
            ref={inputRef}
            className="chatComposerInput"
            rows={3}
            placeholder="Ask about this profile"
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
        </Localized>
        <div className="chatComposerActions">
          <Localized id="ChatComposer--hint">
            <span className="chatComposerHint">
              Enter to send, Shift+Enter for a new line
            </span>
          </Localized>
          {isTurnRunning ? (
            <Localized id="ChatComposer--stop-button">
              <button
                className="chatComposerButton photon-button photon-button-micro"
                type="button"
                onClick={onStop}
              >
                Stop
              </button>
            </Localized>
          ) : (
            <Localized id="ChatComposer--send-button">
              <button
                className="chatComposerButton chatComposerSendButton photon-button photon-button-micro"
                type="button"
                disabled={text.trim() === ''}
                onClick={send}
              >
                Send
              </button>
            </Localized>
          )}
        </div>
      </div>
    </div>
  );
}
