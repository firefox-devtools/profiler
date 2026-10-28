/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  Reducer,
  ChatConversation,
  ChatProviderPreset,
  ChatState,
} from 'firefox-profiler/types';
import {
  CHAT_PROVIDER_PRESETS,
  getStoredProviderPreset,
  getStoredProviderSettings,
  hasCompleteSettings,
} from 'firefox-profiler/app-logic/profile-chat/provider-settings';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

function _emptyConversation(preset: ChatProviderPreset): ChatConversation {
  return { format: CHAT_PROVIDER_PRESETS[preset].format, messages: [] };
}

function _getInitialState(): ChatState {
  const preset = getStoredProviderPreset();
  return {
    isOpen: false,
    status: 'idle',
    error: null,
    notice: null,
    conversation: _emptyConversation(preset),
    streamingText: '',
    providerPreset: preset,
    hasCredentials: hasCompleteSettings(
      preset,
      getStoredProviderSettings(preset)
    ),
    conversationId: 0,
  };
}

function _startNewConversation(state: ChatState): ChatState {
  return {
    ...state,
    status: 'idle',
    error: null,
    notice: null,
    conversation: _emptyConversation(state.providerPreset),
    streamingText: '',
    conversationId: state.conversationId + 1,
  };
}

function _appendMessages(
  conversation: ChatConversation,
  appended: ChatConversation
): ChatConversation {
  // A mismatch can't happen: the format only changes with a new conversation.
  switch (conversation.format) {
    case 'anthropic':
      return appended.format === 'anthropic'
        ? {
            format: 'anthropic',
            messages: [...conversation.messages, ...appended.messages],
          }
        : conversation;
    case 'openai-chat':
      return appended.format === 'openai-chat'
        ? {
            format: 'openai-chat',
            messages: [...conversation.messages, ...appended.messages],
          }
        : conversation;
    case 'openai-responses':
      return appended.format === 'openai-responses'
        ? {
            format: 'openai-responses',
            messages: [...conversation.messages, ...appended.messages],
          }
        : conversation;
    default:
      throw assertExhaustiveCheck(conversation);
  }
}

const chat: Reducer<ChatState> = (state = _getInitialState(), action) => {
  switch (action.type) {
    case 'OPEN_CHAT':
      return { ...state, isOpen: true };
    case 'CLOSE_CHAT':
      return { ...state, isOpen: false };
    case 'CHAT_PROVIDER_CHANGED': {
      const newState = {
        ...state,
        providerPreset: action.preset,
        hasCredentials: action.hasCredentials,
      };
      // Conversations aren't translated between providers.
      return action.preset === state.providerPreset
        ? newState
        : _startNewConversation(newState);
    }
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
