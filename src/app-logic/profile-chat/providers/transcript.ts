/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Turn a conversation into the transcript to render. This is used by a
 * selector, so it must only import types from the provider SDKs.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type {
  ChatConversation,
  ChatTranscriptItem,
} from 'firefox-profiler/types';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { VIEW_CONTEXT_START } from '../view-context';

type ToolCallResult = { text: string; isError: boolean };

// Chat Completions tool results don't have an error flag, so the results of
// failed commands start with this prefix.
export const OPENAI_TOOL_ERROR_PREFIX = 'Error: ';

// In Chat Completions user messages, the view context follows the user's text
// after this separator.
const OPENAI_VIEW_CONTEXT_SEPARATOR = '\n\n' + VIEW_CONTEXT_START;

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

function _getOpenAIText(
  content: ChatCompletionMessageParam['content'] | undefined
): string {
  if (typeof content === 'string') {
    return content;
  }
  return (content ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('');
}

function _getOpenAIChatTranscript(
  messages: ChatCompletionMessageParam[]
): ChatTranscriptItem[] {
  const toolResults = new Map<string, ToolCallResult>();
  for (const message of messages) {
    if (message.role === 'tool') {
      const text = _getOpenAIText(message.content);
      toolResults.set(message.tool_call_id, {
        text,
        isError: text.startsWith(OPENAI_TOOL_ERROR_PREFIX),
      });
    }
  }

  const items: ChatTranscriptItem[] = [];
  for (const message of messages) {
    switch (message.role) {
      case 'user': {
        const text = _getOpenAIText(message.content);
        const end = text.lastIndexOf(OPENAI_VIEW_CONTEXT_SEPARATOR);
        items.push({
          type: 'user',
          text: end === -1 ? text : text.slice(0, end),
        });
        break;
      }
      case 'assistant': {
        const text = _getOpenAIText(message.content);
        if (text !== '') {
          items.push({ type: 'assistant', text });
        }
        for (const toolCall of message.tool_calls ?? []) {
          if (toolCall.type !== 'function') {
            continue;
          }
          let command = toolCall.function.arguments;
          try {
            const input = JSON.parse(command) as { args?: unknown } | null;
            if (typeof input?.args === 'string') {
              command = input.args;
            }
          } catch {
            // Shown as the model sent it.
          }
          items.push({
            type: 'tool-call',
            id: toolCall.id,
            command,
            result: toolResults.get(toolCall.id) ?? null,
          });
        }
        break;
      }
      default:
        // System and tool messages aren't shown.
        break;
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
    case 'openai-chat':
      return _getOpenAIChatTranscript(conversation.messages);
    default:
      throw assertExhaustiveCheck(conversation);
  }
}
