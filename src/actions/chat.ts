/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getApiKey,
  removeApiKey,
  setApiKey,
} from 'firefox-profiler/app-logic/profile-chat/api-key-storage';
import { buildViewContext } from 'firefox-profiler/app-logic/profile-chat/view-context';
import {
  describeUnknownChatError,
  type ChatProvider,
} from 'firefox-profiler/app-logic/profile-chat/providers/types';
import {
  getChatConversation,
  getChatConversationId,
  getIsChatTurnRunning,
} from 'firefox-profiler/selectors/chat';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type {
  Action,
  ChatConversation,
  ChatError,
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

export function saveApiKey(apiKey: string): ThunkAction<void> {
  return (dispatch) => {
    setApiKey(apiKey);
    dispatch({ type: 'CHAT_API_KEY_CHANGED', hasApiKey: true });
  };
}

export function forgetApiKey(): ThunkAction<void> {
  return (dispatch) => {
    dispatch(cancelChatTurn());
    removeApiKey();
    dispatch({ type: 'CHAT_API_KEY_CHANGED', hasApiKey: false });
  };
}

/**
 * Send a message to the chat and run the turn: the model's response and any
 * profiler-cli commands it runs against the live store.
 */
export function sendChatMessage(text: string): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    const apiKey = getApiKey();
    if (apiKey === null) {
      dispatch({ type: 'CHAT_API_KEY_CHANGED', hasApiKey: false });
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
            createAnthropicProvider(apiKey),
            conversation.messages,
            (messages) => ({ format: 'anthropic', messages })
          );
          break;
        }
        default:
          throw assertExhaustiveCheck(conversation.format);
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
