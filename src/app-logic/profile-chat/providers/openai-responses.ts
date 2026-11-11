/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The chat provider for the OpenAI Responses API, used for OpenAI itself.
 * Unlike Chat Completions, it supports function tools together with
 * reasoning on all of OpenAI's reasoning models.
 *
 * Requests use `store: false`, so OpenAI doesn't keep the conversation. The
 * reasoning items come back encrypted and are sent back unchanged, so that the
 * model keeps its reasoning across tool calls.
 */

import OpenAI from 'openai';
import type {
  FunctionTool,
  Response,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import {
  getSystemPromptParts,
  PROFILER_CLI_TOOL_DESCRIPTION,
  PROFILER_CLI_TOOL_NAME,
  PROFILER_CLI_TOOL_PARAMETERS,
} from '../system-prompt';
import { describeOpenAIError, parseFunctionToolCall } from './openai-chat';
import { OPENAI_TOOL_ERROR_PREFIX } from './transcript';
import type {
  ChatProvider,
  ProviderResponse,
  ProviderStopReason,
} from './types';

export type OpenAIResponsesProviderOptions = {
  // The name for error messages.
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
};

const PROFILER_CLI_TOOL: FunctionTool = {
  type: 'function',
  name: PROFILER_CLI_TOOL_NAME,
  description: PROFILER_CLI_TOOL_DESCRIPTION,
  parameters: PROFILER_CLI_TOOL_PARAMETERS,
  strict: true,
};

function _getStopReason(
  response: Response,
  hasToolCalls: boolean,
  hasRefusal: boolean
): ProviderStopReason {
  if (response.status === 'incomplete') {
    return response.incomplete_details?.reason === 'content_filter'
      ? 'refusal'
      : 'max-tokens';
  }
  if (hasRefusal) {
    return 'refusal';
  }
  return hasToolCalls ? 'tool-calls' : 'end';
}

export function createOpenAIResponsesProvider({
  name,
  baseURL,
  apiKey,
  model,
}: OpenAIResponsesProviderOptions): ChatProvider<ResponseInputItem> {
  const client = new OpenAI({ baseURL, apiKey, dangerouslyAllowBrowser: true });
  const instructions = getSystemPromptParts().join('\n\n');

  return {
    makeUserMessage(text, viewContext) {
      return {
        role: 'user',
        content: [
          { type: 'input_text', text },
          { type: 'input_text', text: viewContext },
        ],
      };
    },

    async streamResponse(
      history,
      signal,
      onText
    ): Promise<ProviderResponse<ResponseInputItem>> {
      const stream = await client.responses.create(
        {
          model,
          instructions,
          input: history,
          tools: [PROFILER_CLI_TOOL],
          stream: true,
          store: false,
          include: ['reasoning.encrypted_content'],
        },
        { signal }
      );

      let text = '';
      let textItemId: string | null = null;
      let response: Response | null = null;
      for await (const event of stream) {
        switch (event.type) {
          case 'response.output_text.delta':
            if (textItemId !== null && textItemId !== event.item_id) {
              text += '\n\n';
            }
            textItemId = event.item_id;
            text += event.delta;
            onText(text);
            break;
          case 'response.completed':
          case 'response.incomplete':
          case 'response.failed':
            response = event.response;
            break;
          default:
            break;
        }
      }
      if (response === null) {
        throw new Error('The response ended without completing.');
      }
      if (response.status === 'failed') {
        throw new Error(response.error?.message ?? 'The response failed.');
      }

      // Only these item types can come back, as there's only a function tool.
      const messages: ResponseInputItem[] = [];
      let refusal: string | null = null;
      const toolCalls = [];
      for (const item of response.output) {
        switch (item.type) {
          case 'message':
            for (const part of item.content) {
              if (part.type === 'refusal') {
                refusal = part.refusal;
              }
            }
            messages.push(item);
            break;
          case 'function_call':
            toolCalls.push(
              parseFunctionToolCall(item.call_id, item.name, item.arguments)
            );
            messages.push(item);
            break;
          case 'reasoning':
            messages.push(item);
            break;
          default:
            break;
        }
      }

      return {
        messages,
        toolCalls,
        stop: _getStopReason(response, toolCalls.length > 0, refusal !== null),
        refusalExplanation: refusal,
      };
    },

    makeToolResultMessages(results) {
      return results.map(({ id, text, isError }) => ({
        type: 'function_call_output',
        call_id: id,
        output:
          isError && !text.startsWith(OPENAI_TOOL_ERROR_PREFIX)
            ? OPENAI_TOOL_ERROR_PREFIX + text
            : text,
      }));
    },

    describeError: (error) => describeOpenAIError(error, name),
  };
}
