/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import classNames from 'classnames';

import explicitConnect from 'firefox-profiler/utils/connect';
import { ResizableWithSplitter } from 'firefox-profiler/components/shared/ResizableWithSplitter';
import {
  cancelChatTurn,
  closeChat,
  forgetApiKey,
  resetChat,
  saveApiKey,
  sendChatMessage,
} from 'firefox-profiler/actions/chat';
import {
  getChatError,
  getChatHasApiKey,
  getChatNotice,
  getChatStatus,
  getChatStreamingText,
  getChatTranscript,
  getIsChatTurnRunning,
} from 'firefox-profiler/selectors/chat';
import { ChatApiKeyForm } from './ChatApiKeyForm';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript } from './ChatTranscript';

import type {
  ChatError,
  ChatStatus,
  ChatTranscriptItem,
  ChatTurnOutcome,
} from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './ChatDrawer.css';

type StateProps = {
  readonly hasApiKey: boolean;
  readonly status: ChatStatus;
  readonly error: ChatError | null;
  readonly notice: ChatTurnOutcome | null;
  readonly transcript: ChatTranscriptItem[];
  readonly streamingText: string;
  readonly isTurnRunning: boolean;
};

type DispatchProps = {
  readonly closeChat: typeof closeChat;
  readonly resetChat: typeof resetChat;
  readonly forgetApiKey: typeof forgetApiKey;
  readonly saveApiKey: typeof saveApiKey;
  readonly sendChatMessage: typeof sendChatMessage;
  readonly cancelChatTurn: typeof cancelChatTurn;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class ChatDrawerImpl extends PureComponent<Props> {
  _onSend = (text: string) => {
    this.props.sendChatMessage(text);
  };

  override render() {
    const {
      hasApiKey,
      status,
      error,
      notice,
      transcript,
      streamingText,
      isTurnRunning,
      closeChat,
      resetChat,
      forgetApiKey,
      saveApiKey,
      cancelChatTurn,
    } = this.props;

    return (
      <ResizableWithSplitter
        className="chatDrawerWrapper"
        splitterPosition="start"
        controlledProperty="width"
        percent={false}
        initialSize="380px"
      >
        <aside className="chatDrawer">
          <header className="chatDrawerHeader">
            <Localized id="ChatDrawer--title">
              <h2 className="chatDrawerTitle">Ask about this profile</h2>
            </Localized>
            {hasApiKey ? (
              <>
                <Localized id="ChatDrawer--new-chat-button">
                  <button
                    className="chatDrawerHeaderButton photon-button photon-button-micro"
                    type="button"
                    onClick={resetChat}
                  >
                    New chat
                  </button>
                </Localized>
                <Localized id="ChatDrawer--forget-key-button">
                  <button
                    className="chatDrawerHeaderButton photon-button photon-button-micro"
                    type="button"
                    onClick={forgetApiKey}
                  >
                    Forget key
                  </button>
                </Localized>
              </>
            ) : null}
            <Localized id="ChatDrawer--close-button" attrs={{ title: true }}>
              <button
                className={classNames(
                  'chatDrawerCloseButton',
                  'photon-button',
                  'photon-button-ghost'
                )}
                title="Close"
                type="button"
                onClick={closeChat}
              />
            </Localized>
          </header>
          {hasApiKey ? (
            <>
              <ChatTranscript
                items={transcript}
                streamingText={streamingText}
                status={status}
                notice={notice}
                error={error}
              />
              <ChatComposer
                isTurnRunning={isTurnRunning}
                onSend={this._onSend}
                onStop={cancelChatTurn}
              />
            </>
          ) : (
            <ChatApiKeyForm error={error} onSave={saveApiKey} />
          )}
        </aside>
      </ResizableWithSplitter>
    );
  }
}

export const ChatDrawer = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    hasApiKey: getChatHasApiKey(state),
    status: getChatStatus(state),
    error: getChatError(state),
    notice: getChatNotice(state),
    transcript: getChatTranscript(state),
    streamingText: getChatStreamingText(state),
    isTurnRunning: getIsChatTurnRunning(state),
  }),
  mapDispatchToProps: {
    closeChat,
    resetChat,
    forgetApiKey,
    saveApiKey,
    sendChatMessage,
    cancelChatTurn,
  },
  component: ChatDrawerImpl,
});
