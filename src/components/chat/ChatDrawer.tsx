/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent, type KeyboardEvent } from 'react';
import { Localized } from '@fluent/react';
import classNames from 'classnames';

import explicitConnect from 'firefox-profiler/utils/connect';
import { ResizableWithSplitter } from 'firefox-profiler/components/shared/ResizableWithSplitter';
import {
  cancelChatTurn,
  closeChat,
  forgetChatApiKey,
  resetChat,
  saveChatProviderSettings,
  sendChatMessage,
  updateChatDraft,
} from 'firefox-profiler/actions/chat';
import {
  getChatDraft,
  getChatError,
  getChatHasCredentials,
  getChatNotice,
  getChatProviderPreset,
  getChatStatus,
  getChatStreamingText,
  getChatTranscript,
  getIsChatTurnRunning,
} from 'firefox-profiler/selectors/chat';
import { ChatProviderSettings } from './ChatProviderSettings';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript } from './ChatTranscript';

import type {
  ChatError,
  ChatProviderPreset,
  ChatStatus,
  ChatTranscriptItem,
  ChatTurnOutcome,
} from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './ChatDrawer.css';

type StateProps = {
  readonly hasCredentials: boolean;
  readonly preset: ChatProviderPreset;
  readonly status: ChatStatus;
  readonly error: ChatError | null;
  readonly notice: ChatTurnOutcome | null;
  readonly transcript: ChatTranscriptItem[];
  readonly streamingText: string;
  readonly isTurnRunning: boolean;
  readonly draft: string;
};

type DispatchProps = {
  readonly closeChat: typeof closeChat;
  readonly resetChat: typeof resetChat;
  readonly forgetChatApiKey: typeof forgetChatApiKey;
  readonly saveChatProviderSettings: typeof saveChatProviderSettings;
  readonly sendChatMessage: typeof sendChatMessage;
  readonly cancelChatTurn: typeof cancelChatTurn;
  readonly updateChatDraft: typeof updateChatDraft;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

type State = {
  readonly isSettingsOpen: boolean;
};

class ChatDrawerImpl extends PureComponent<Props, State> {
  override state: State = { isSettingsOpen: false };

  _onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      this.props.closeChat();
    }
  };

  _onSend = (text: string) => {
    this.props.sendChatMessage(text);
  };

  _openSettings = () => {
    this.setState({ isSettingsOpen: true });
  };

  _closeSettings = () => {
    this.setState({ isSettingsOpen: false });
  };

  _onSaveSettings = (...args: Parameters<typeof saveChatProviderSettings>) => {
    this.props.saveChatProviderSettings(...args);
    this.setState({ isSettingsOpen: false });
  };

  override render() {
    const {
      hasCredentials,
      preset,
      status,
      error,
      notice,
      transcript,
      streamingText,
      isTurnRunning,
      draft,
      closeChat,
      resetChat,
      forgetChatApiKey,
      cancelChatTurn,
      updateChatDraft,
    } = this.props;
    const showSettings = !hasCredentials || this.state.isSettingsOpen;

    return (
      <ResizableWithSplitter
        className="chatDrawerWrapper"
        splitterPosition="start"
        controlledProperty="width"
        percent={false}
        initialSize="380px"
      >
        <aside
          className="chatDrawer"
          aria-labelledby="chatDrawerTitle"
          onKeyDown={this._onKeyDown}
        >
          <header className="chatDrawerHeader">
            <Localized id="ChatDrawer--title">
              <h2 className="chatDrawerTitle" id="chatDrawerTitle">
                Ask about this profile
              </h2>
            </Localized>
            {showSettings ? null : (
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
                <Localized id="ChatDrawer--settings-button">
                  <button
                    className="chatDrawerHeaderButton photon-button photon-button-micro"
                    type="button"
                    onClick={this._openSettings}
                  >
                    Settings
                  </button>
                </Localized>
              </>
            )}
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
          {showSettings ? (
            <ChatProviderSettings
              preset={preset}
              error={error}
              onSave={this._onSaveSettings}
              onForgetApiKey={forgetChatApiKey}
              onCancel={hasCredentials ? this._closeSettings : null}
            />
          ) : (
            <>
              <ChatTranscript
                items={transcript}
                preset={preset}
                streamingText={streamingText}
                status={status}
                notice={notice}
                error={error}
              />
              <ChatComposer
                isTurnRunning={isTurnRunning}
                text={draft}
                onTextChange={updateChatDraft}
                onSend={this._onSend}
                onStop={cancelChatTurn}
              />
            </>
          )}
        </aside>
      </ResizableWithSplitter>
    );
  }
}

export const ChatDrawer = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    hasCredentials: getChatHasCredentials(state),
    preset: getChatProviderPreset(state),
    status: getChatStatus(state),
    error: getChatError(state),
    notice: getChatNotice(state),
    transcript: getChatTranscript(state),
    streamingText: getChatStreamingText(state),
    isTurnRunning: getIsChatTurnRunning(state),
    draft: getChatDraft(state),
  }),
  mapDispatchToProps: {
    closeChat,
    resetChat,
    forgetChatApiKey,
    saveChatProviderSettings,
    sendChatMessage,
    cancelChatTurn,
    updateChatDraft,
  },
  component: ChatDrawerImpl,
});
