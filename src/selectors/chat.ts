/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from 'reselect';
import { getChatTranscriptItems } from 'firefox-profiler/app-logic/profile-chat/providers/transcript';
import type {
  ChatConversation,
  ChatError,
  ChatState,
  ChatTurnOutcome,
  ChatStatus,
  ChatTranscriptItem,
  Selector,
} from 'firefox-profiler/types';

export const getChat: Selector<ChatState> = (state) => state.chat;
export const getIsChatOpen: Selector<boolean> = (state) =>
  getChat(state).isOpen;
export const getChatStatus: Selector<ChatStatus> = (state) =>
  getChat(state).status;
export const getChatError: Selector<ChatError | null> = (state) =>
  getChat(state).error;
export const getChatNotice: Selector<ChatTurnOutcome | null> = (state) =>
  getChat(state).notice;
export const getChatConversation: Selector<ChatConversation> = (state) =>
  getChat(state).conversation;
export const getChatStreamingText: Selector<string> = (state) =>
  getChat(state).streamingText;
export const getChatHasApiKey: Selector<boolean> = (state) =>
  getChat(state).hasApiKey;
export const getChatConversationId: Selector<number> = (state) =>
  getChat(state).conversationId;

export const getIsChatTurnRunning: Selector<boolean> = (state) => {
  const status = getChatStatus(state);
  return status === 'streaming' || status === 'running-tool';
};

export const getChatTranscript: Selector<ChatTranscriptItem[]> = createSelector(
  getChatConversation,
  getChatTranscriptItems
);
