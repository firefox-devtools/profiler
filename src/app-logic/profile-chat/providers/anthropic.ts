/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The chat provider for the Anthropic Messages API.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessageParam,
  BetaTextBlockParam,
  BetaTool,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ChatError } from 'firefox-profiler/types';
import {
  getProfilerCliArgs,
  getSystemPromptParts,
  PROFILER_CLI_TOOL_DESCRIPTION,
  PROFILER_CLI_TOOL_NAME,
  PROFILER_CLI_TOOL_PARAMETERS,
} from '../system-prompt';
import {
  describeUnknownChatError,
  type ChatProvider,
  type ProviderResponse,
  type ProviderStopReason,
} from './types';

export const ANTHROPIC_MODEL = 'claude-opus-5-5';

const MAX_TOKENS = 16000;

const PROFILER_CLI_TOOL: BetaTool = {
  name: PROFILER_CLI_TOOL_NAME,
  description: PROFILER_CLI_TOOL_DESCRIPTION,
  input_schema: PROFILER_CLI_TOOL_PARAMETERS,
  strict: true,
};

function _getSystemPrompt(): BetaTextBlockParam[] {
  const blocks: BetaTextBlockParam[] = getSystemPromptParts().map((text) => ({
    type: 'text',
    text,
  }));
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  return blocks;
}

function _getStopReason(
  stopReason: string | null,
  hasToolCalls: boolean
): ProviderStopReason {
  switch (stopReason) {
    case 'tool_use':
      return hasToolCalls ? 'tool-calls' : 'end';
    case 'max_tokens':
      return 'max-tokens';
    case 'refusal':
      return 'refusal';
    default:
      // end_turn, and pause_turn, which only server tools produce.
      return 'end';
  }
}

// The SDK's message is the status followed by the raw JSON body, so prefer
// the human-readable message from the body when there is one.
function _getApiErrorMessage(error: InstanceType<typeof Anthropic.APIError>) {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === 'string' ? message : error.message;
}

export function createAnthropicProvider(
  apiKey: string
): ChatProvider<BetaMessageParam> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  return {
    makeUserMessage(text, viewContext) {
      return {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'text', text: viewContext },
        ],
      };
    },

    async streamResponse(
      history,
      signal,
      onText
    ): Promise<ProviderResponse<BetaMessageParam>> {
      const stream = client.beta.messages.stream(
        {
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system: _getSystemPrompt(),
          tools: [PROFILER_CLI_TOOL],
          messages: history,
          output_config: { effort: 'medium' },
          // Retries a refused request on another model instead of stopping.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal }
      );

      let text = '';
      for await (const event of stream) {
        if (
          event.type === 'content_block_start' &&
          event.content_block.type === 'text' &&
          text !== ''
        ) {
          text += '\n\n';
        } else if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          text += event.delta.text;
          onText(text);
        }
      }
      const message = await stream.finalMessage();

      const toolCalls = message.content
        .filter((block): block is BetaToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          name: block.name,
          args: getProfilerCliArgs(block.name, block.input),
        }));
      return {
        messages: [{ role: 'assistant', content: message.content }],
        toolCalls,
        stop: _getStopReason(message.stop_reason, toolCalls.length > 0),
        refusalExplanation:
          message.stop_details?.type === 'refusal'
            ? (message.stop_details.explanation ?? null)
            : null,
      };
    },

    makeToolResultMessages(results) {
      if (results.length === 0) {
        return [];
      }
      return [
        {
          role: 'user',
          content: results.map(({ id, text, isError }) => ({
            type: 'tool_result',
            tool_use_id: id,
            content: text,
            is_error: isError,
          })),
        },
      ];
    },

    describeError(error: unknown): ChatError {
      if (error instanceof Anthropic.AuthenticationError) {
        return { type: 'auth', message: _getApiErrorMessage(error) };
      }
      if (error instanceof Anthropic.PermissionDeniedError) {
        return { type: 'permission', message: _getApiErrorMessage(error) };
      }
      if (error instanceof Anthropic.RateLimitError) {
        return { type: 'rate-limit' };
      }
      if (error instanceof Anthropic.APIConnectionError) {
        return { type: 'connection', message: error.message };
      }
      if (error instanceof Anthropic.APIError) {
        return {
          type: 'api',
          status: error.status ?? null,
          message: _getApiErrorMessage(error),
        };
      }
      return describeUnknownChatError(error);
    },
  };
}
