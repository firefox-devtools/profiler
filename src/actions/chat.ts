/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  CHAT_PROVIDER_PRESETS,
  getBaseURL,
  getProviderDisplayName,
  getStoredProviderPreset,
  getStoredProviderSettings,
  hasCompleteSettings,
  storeProviderSettings,
  type ChatProviderSettings,
} from 'firefox-profiler/app-logic/profile-chat/provider-settings';
import { buildViewContext } from 'firefox-profiler/app-logic/profile-chat/view-context';
import {
  describeUnknownChatError,
  type ChatProvider,
} from 'firefox-profiler/app-logic/profile-chat/providers/types';
import {
  getChatConversation,
  getChatProviderPreset,
  getChatConversationId,
  getIsChatTurnRunning,
} from 'firefox-profiler/selectors/chat';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type {
  Action,
  ChatConversation,
  ChatError,
  ChatProviderPreset,
  ChatTurnOutcome,
  ThunkAction,
} from 'firefox-profiler/types';

// Limits how often streamed text is dispatched, to avoid a render per token.
const STREAMING_TEXT_THROTTLE_MS = 50;

let _currentTurnController: AbortController | null = null;

export function openChat(): Action {
  return { type: 'OPEN_CHAT' };
}

export function closeChat(): Action {
  return { type: 'CLOSE_CHAT' };
}

export function cancelChatTurn(): ThunkAction<void> {
  return () => {
    _currentTurnController?.abort();
  };
}

export function resetChat(): ThunkAction<void> {
  return (dispatch) => {
    dispatch(cancelChatTurn());
    dispatch({ type: 'RESET_CHAT' });
  };
}

/**
 * Store the settings of a provider and select it. Selecting another provider
 * starts a new chat.
 */
export function saveChatProviderSettings(
  preset: ChatProviderPreset,
  settings: ChatProviderSettings
): ThunkAction<void> {
  return (dispatch, getState) => {
    if (preset !== getChatProviderPreset(getState())) {
      dispatch(cancelChatTurn());
    }
    storeProviderSettings(preset, settings);
    dispatch({
      type: 'CHAT_PROVIDER_CHANGED',
      preset,
      hasCredentials: hasCompleteSettings(preset, settings),
    });
  };
}

/**
 * Forget the API key of the selected provider, keeping its other settings.
 */
export function forgetChatApiKey(): ThunkAction<void> {
  return (dispatch, getState) => {
    dispatch(cancelChatTurn());
    const preset = getChatProviderPreset(getState());
    const { apiKey: _apiKey, ...settings } = getStoredProviderSettings(preset);
    storeProviderSettings(preset, settings);
    dispatch({
      type: 'CHAT_PROVIDER_CHANGED',
      preset,
      hasCredentials: hasCompleteSettings(preset, settings),
    });
  };
}

/**
 * Send a message to the chat and run the turn: the model's response and any
 * profiler-cli commands it runs against the live store.
 */
export function sendChatMessage(text: string): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const preset = getStoredProviderPreset();
    const settings = getStoredProviderSettings(preset);
    if (
      preset !== getChatProviderPreset(getState()) ||
      !hasCompleteSettings(preset, settings)
    ) {
      // The settings changed in another tab.
      dispatch({
        type: 'CHAT_PROVIDER_CHANGED',
        preset,
        hasCredentials: hasCompleteSettings(preset, settings),
      });
      return;
    }
    // The controller is set before anything async, so a second send while the
    // first one is still loading is ignored too.
    if (_currentTurnController !== null || getIsChatTurnRunning(getState())) {
      return;
    }

    const conversationId = getChatConversationId(getState());
    const store = { getState, dispatch };
    const controller = new AbortController();
    _currentTurnController = controller;

    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelStreamingText = () => {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    // Replaced by the provider's own once it's loaded.
    let describeError: (error: unknown) => ChatError = describeUnknownChatError;

    // Runs the turn with the provider of the conversation's format. `wrap`
    // tags messages with that format for the actions.
    async function runTurn<M>(
      provider: ChatProvider<M>,
      history: M[],
      wrap: (messages: M[]) => ChatConversation
    ) {
      describeError = (error) => provider.describeError(error);
      // Loaded on demand to keep the SDK and commander out of the main bundle.
      const [engine, executor] = await Promise.all([
        import('firefox-profiler/app-logic/profile-chat/chat-engine'),
        import('firefox-profiler/app-logic/profile-chat/pq-browser-executor'),
      ]);

      const status = await executor.getCurrentViewStatus(store);
      const userMessage = provider.makeUserMessage(
        text,
        buildViewContext(getState(), status)
      );
      dispatch({
        type: 'CHAT_TURN_STARTED',
        conversationId,
        messages: wrap([userMessage]),
      });

      let pendingText = '';
      return engine.runChatTurn({
        provider,
        history: [...history, userMessage],
        runTool: (args) => executor.runProfilerCliCommand(store, args),
        signal: controller.signal,
        onTextDelta: (streamedText) => {
          pendingText = streamedText;
          if (flushTimer === null) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              dispatch({
                type: 'CHAT_STREAMING_TEXT',
                conversationId,
                text: pendingText,
              });
            }, STREAMING_TEXT_THROTTLE_MS);
          }
        },
        onMessages: (messages, isRunningTools) => {
          cancelStreamingText();
          dispatch({
            type: 'CHAT_MESSAGES_APPENDED',
            conversationId,
            messages: wrap(messages),
            isRunningTools,
          });
        },
      });
    }

    try {
      const conversation = getChatConversation(getState());
      let outcome: ChatTurnOutcome;
      switch (conversation.format) {
        case 'anthropic': {
          const { createAnthropicProvider } =
            await import('firefox-profiler/app-logic/profile-chat/providers/anthropic');
          outcome = await runTurn(
            createAnthropicProvider(settings.apiKey ?? ''),
            conversation.messages,
            (messages) => ({ format: 'anthropic', messages })
          );
          break;
        }
        case 'openai-chat': {
          const { createOpenAIChatProvider } =
            await import('firefox-profiler/app-logic/profile-chat/providers/openai-chat');
          outcome = await runTurn(
            createOpenAIChatProvider({
              name: getProviderDisplayName(preset, settings),
              baseURL: getBaseURL(preset, settings),
              apiKey: settings.apiKey ?? null,
              model: settings.model ?? '',
              strictTools: CHAT_PROVIDER_PRESETS[preset].strictTools,
            }),
            conversation.messages,
            (messages) => ({ format: 'openai-chat', messages })
          );
          break;
        }
        default:
          throw assertExhaustiveCheck(conversation);
      }

      cancelStreamingText();
      dispatch({ type: 'CHAT_TURN_FINISHED', conversationId, outcome });
    } catch (error) {
      cancelStreamingText();
      // The key is kept even when the API rejects it: a 401 can also come from
      // an organization policy, such as no browser access with custom data
      // retention, where entering the key again wouldn't help.
      dispatch({
        type: 'CHAT_TURN_FAILED',
        conversationId,
        error: describeError(error),
      });
    } finally {
      if (_currentTurnController === controller) {
        _currentTurnController = null;
      }
    }
  };
}
