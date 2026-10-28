/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Reducer,
  ChatConversation,
  ChatState,
} from 'firefox-profiler/types';
import { getApiKey } from 'firefox-profiler/app-logic/profile-chat/api-key-storage';

function _getInitialState(): ChatState {
  return {
    isOpen: false,
    status: 'idle',
    error: null,
    notice: null,
    conversation: { format: 'anthropic', messages: [] },
    streamingText: '',
    hasApiKey: getApiKey() !== null,
    conversationId: 0,
  };
}

function _startNewConversation(state: ChatState): ChatState {
  return {
    ...state,
    status: 'idle',
    error: null,
    notice: null,
    conversation: { format: state.conversation.format, messages: [] },
    streamingText: '',
    conversationId: state.conversationId + 1,
  };
}

function _appendMessages(
  conversation: ChatConversation,
  appended: ChatConversation
): ChatConversation {
  if (conversation.format !== appended.format) {
    // Can't happen: the format only changes with a new conversation.
    return conversation;
  }
  return {
    format: conversation.format,
    messages: [...conversation.messages, ...appended.messages],
  };
}

const chat: Reducer<ChatState> = (state = _getInitialState(), action) => {
  switch (action.type) {
    case 'OPEN_CHAT':
      return { ...state, isOpen: true };
    case 'CLOSE_CHAT':
      return { ...state, isOpen: false };
    case 'CHAT_API_KEY_CHANGED':
      return { ...state, hasApiKey: action.hasApiKey };
    case 'RESET_CHAT':
    case 'PROFILE_LOADED':
      // A conversation is about one profile, so a new one starts a new chat.
      return _startNewConversation(state);
    default:
      break;
  }

  if (
    !('conversationId' in action) ||
    action.conversationId !== state.conversationId
  ) {
    return state;
  }

  switch (action.type) {
    case 'CHAT_TURN_STARTED':
      return {
        ...state,
        status: 'streaming',
        error: null,
        notice: null,
        streamingText: '',
        conversation: _appendMessages(state.conversation, action.messages),
      };
    case 'CHAT_STREAMING_TEXT':
      return { ...state, streamingText: action.text };
    case 'CHAT_MESSAGES_APPENDED':
      return {
        ...state,
        status: action.isRunningTools ? 'running-tool' : 'streaming',
        streamingText: '',
        conversation: _appendMessages(state.conversation, action.messages),
      };
    case 'CHAT_TURN_FINISHED':
      return {
        ...state,
        status: 'idle',
        streamingText: '',
        notice: action.outcome.type === 'done' ? null : action.outcome,
      };
    case 'CHAT_TURN_FAILED':
      return {
        ...state,
        status: 'error',
        streamingText: '',
        error: action.error,
      };
    default:
      return state;
  }
};

export default chat;
