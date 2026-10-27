/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Reducer, ChatState } from 'firefox-profiler/types';
import { getApiKey } from 'firefox-profiler/app-logic/profile-chat/api-key-storage';

function _getInitialState(): ChatState {
  return {
    isOpen: false,
    status: 'idle',
    error: null,
    notice: null,
    apiHistory: [],
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
    apiHistory: [],
    streamingText: '',
    conversationId: state.conversationId + 1,
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
        apiHistory: [...state.apiHistory, action.message],
      };
    case 'CHAT_STREAMING_TEXT':
      return { ...state, streamingText: action.text };
    case 'CHAT_MESSAGE_APPENDED': {
      const { message } = action;
      let status = state.status;
      if (message.role === 'assistant') {
        const hasToolUse =
          Array.isArray(message.content) &&
          message.content.some((block) => block.type === 'tool_use');
        status = hasToolUse ? 'running-tool' : 'streaming';
      } else {
        status = 'streaming';
      }
      return {
        ...state,
        status,
        streamingText: '',
        apiHistory: [...state.apiHistory, message],
      };
    }
    case 'CHAT_TURN_FINISHED':
      return {
        ...state,
        status: 'idle',
        streamingText: '',
        notice: action.notice,
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
