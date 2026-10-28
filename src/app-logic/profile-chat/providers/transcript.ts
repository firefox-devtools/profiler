/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Turn a conversation into the transcript to render. This is used by a
 * selector, so it must only import types from the provider SDKs.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type {
  ChatConversation,
  ChatTranscriptItem,
} from 'firefox-profiler/types';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { VIEW_CONTEXT_START } from '../view-context';

type ToolCallResult = { text: string; isError: boolean };

function _getAnthropicTranscript(
  messages: BetaMessageParam[]
): ChatTranscriptItem[] {
  const items: ChatTranscriptItem[] = [];
  const toolResults = new Map<string, ToolCallResult>();
  for (const message of messages) {
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

  for (const message of messages) {
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

/**
 * The user's text (without the view context block), the assistant's text, and
 * each tool call paired with its result.
 */
export function getChatTranscriptItems(
  conversation: ChatConversation
): ChatTranscriptItem[] {
  switch (conversation.format) {
    case 'anthropic':
      return _getAnthropicTranscript(conversation.messages);
    default:
      throw assertExhaustiveCheck(conversation.format);
  }
}
