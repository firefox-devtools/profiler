/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from 'reselect';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { VIEW_CONTEXT_START } from 'firefox-profiler/app-logic/profile-chat/view-context';
import type {
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
export const getChatApiHistory: Selector<BetaMessageParam[]> = (state) =>
  getChat(state).apiHistory;
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

/**
 * The transcript to render: the user's text (without the view context block),
 * the assistant's text, and each tool call paired with its result.
 */
export const getChatTranscript: Selector<ChatTranscriptItem[]> = createSelector(
  getChatApiHistory,
  (apiHistory) => {
    const items: ChatTranscriptItem[] = [];
    const toolResults = new Map<string, { text: string; isError: boolean }>();
    for (const message of apiHistory) {
      if (message.role !== 'user' || typeof message.content === 'string') {
        continue;
      }
      for (const block of message.content ?? []) {
        if (block.type === 'tool_result') {
          toolResults.set(block.tool_use_id, {
            text:
              typeof block.content === 'string'
                ? block.content
                : (block.content ?? [])
                    .map((part) => (part.type === 'text' ? part.text : ''))
                    .join(''),
            isError: block.is_error ?? false,
          });
        }
      }
    }

    for (const message of apiHistory) {
      const { role, content } = message;
      if (role !== 'user' && role !== 'assistant') {
        continue;
      }
      if (typeof content === 'string') {
        items.push({ type: role, text: content });
        continue;
      }
      for (const block of content ?? []) {
        switch (block.type) {
          case 'text':
            if (role === 'user' && block.text.startsWith(VIEW_CONTEXT_START)) {
              break;
            }
            if (block.text !== '') {
              items.push({ type: role, text: block.text });
            }
            break;
          case 'tool_use': {
            const input = block.input as { args?: unknown } | null;
            items.push({
              type: 'tool-call',
              id: block.id,
              command:
                typeof input?.args === 'string'
                  ? input.args
                  : JSON.stringify(block.input),
              result: toolResults.get(block.id) ?? null,
            });
            break;
          }
          default:
            // Thinking, tool results and fallback markers aren't shown.
            break;
        }
      }
    }
    return items;
  }
);
