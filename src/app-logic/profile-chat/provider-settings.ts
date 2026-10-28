/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The chat providers the user can choose from, and their settings in
 * localStorage. Storage can throw (e.g. disabled cookies), in which case the
 * feature behaves as disabled and the settings as empty.
 *
 * This module is in the main bundle, so it must not import a provider SDK.
 */

import type {
  ChatConversationFormat,
  ChatProviderPreset,
} from 'firefox-profiler/types';

const ENABLED_STORAGE_KEY = 'profiler.chat.enabled';
const PRESET_STORAGE_KEY = 'profiler.chat.provider';
const SETTINGS_STORAGE_KEY_PREFIX = 'profiler.chat.settings.';

export type ChatProviderSettings = {
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly model?: string;
};

type PresetInfo = {
  readonly format: ChatConversationFormat;
  // The base URL used when the settings don't have one. Null when the format
  // doesn't need one.
  readonly defaultBaseURL: string | null;
  readonly canChangeBaseURL: boolean;
  readonly requiresApiKey: boolean;
  // Whether the user picks the model. Anthropic uses a fixed model.
  readonly hasModelChoice: boolean;
  // Only OpenAI is known to support strict function schemas.
  readonly strictTools: boolean;
  // The name used in messages like "Could not reach OpenAI". Null to use the
  // host of the base URL.
  readonly name: string | null;
};

export const CHAT_PROVIDER_PRESETS: {
  readonly [K in ChatProviderPreset]: PresetInfo;
} = {
  anthropic: {
    format: 'anthropic',
    defaultBaseURL: null,
    canChangeBaseURL: false,
    requiresApiKey: true,
    hasModelChoice: false,
    strictTools: true,
    name: 'Anthropic',
  },
  openai: {
    format: 'openai-chat',
    defaultBaseURL: 'https://api.openai.com/v1',
    canChangeBaseURL: false,
    requiresApiKey: true,
    hasModelChoice: true,
    strictTools: true,
    name: 'OpenAI',
  },
  local: {
    format: 'openai-chat',
    // Ollama's OpenAI-compatible endpoint. LM Studio uses port 1234.
    defaultBaseURL: 'http://localhost:11434/v1',
    canChangeBaseURL: true,
    requiresApiKey: false,
    hasModelChoice: true,
    strictTools: false,
    name: null,
  },
  custom: {
    format: 'openai-chat',
    defaultBaseURL: '',
    canChangeBaseURL: true,
    requiresApiKey: false,
    hasModelChoice: true,
    strictTools: false,
    name: null,
  },
};

export const CHAT_PROVIDER_PRESET_ORDER: ChatProviderPreset[] = [
  'anthropic',
  'openai',
  'local',
  'custom',
];

function _isPreset(value: string | null): value is ChatProviderPreset {
  return CHAT_PROVIDER_PRESET_ORDER.some((preset) => preset === value);
}

/**
 * The chat is hidden unless enabled from the console with:
 *   localStorage.setItem('profiler.chat.enabled', 'true')
 */
export function isChatFeatureEnabled(): boolean {
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getStoredProviderPreset(): ChatProviderPreset {
  try {
    const preset = window.localStorage.getItem(PRESET_STORAGE_KEY);
    return _isPreset(preset) ? preset : 'anthropic';
  } catch {
    return 'anthropic';
  }
}

export function getStoredProviderSettings(
  preset: ChatProviderPreset
): ChatProviderSettings {
  try {
    const json = window.localStorage.getItem(
      SETTINGS_STORAGE_KEY_PREFIX + preset
    );
    const settings: unknown = json === null ? null : JSON.parse(json);
    if (typeof settings !== 'object' || settings === null) {
      return {};
    }
    const { apiKey, baseURL, model } = settings as Record<string, unknown>;
    return {
      ...(typeof apiKey === 'string' && apiKey !== '' ? { apiKey } : {}),
      ...(typeof baseURL === 'string' && baseURL !== '' ? { baseURL } : {}),
      ...(typeof model === 'string' && model !== '' ? { model } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Store the settings of `preset` and make it the selected provider.
 */
export function storeProviderSettings(
  preset: ChatProviderPreset,
  settings: ChatProviderSettings
): void {
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, preset);
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY_PREFIX + preset,
      JSON.stringify(settings)
    );
  } catch {
    // The settings then only live until the page is reloaded, see
    // hasCredentials in the chat state.
  }
}

export function getBaseURL(
  preset: ChatProviderPreset,
  settings: ChatProviderSettings
): string {
  const info = CHAT_PROVIDER_PRESETS[preset];
  if (info.canChangeBaseURL && settings.baseURL) {
    return settings.baseURL;
  }
  return info.defaultBaseURL ?? '';
}

/**
 * Whether `settings` has everything needed to send a message.
 */
export function hasCompleteSettings(
  preset: ChatProviderPreset,
  settings: ChatProviderSettings
): boolean {
  const info = CHAT_PROVIDER_PRESETS[preset];
  return (
    (!info.requiresApiKey || Boolean(settings.apiKey)) &&
    (!info.hasModelChoice || Boolean(settings.model)) &&
    (info.defaultBaseURL === null || getBaseURL(preset, settings) !== '')
  );
}

/**
 * The provider name for messages, e.g. "OpenAI" or "localhost:11434".
 */
export function getProviderDisplayName(
  preset: ChatProviderPreset,
  settings: ChatProviderSettings
): string {
  const { name } = CHAT_PROVIDER_PRESETS[preset];
  if (name !== null) {
    return name;
  }
  const baseURL = getBaseURL(preset, settings);
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

/**
 * List the models of an OpenAI-compatible endpoint, sorted by id. This uses
 * fetch rather than the SDK so that the settings form doesn't load the SDK.
 */
export async function fetchModelList(
  baseURL: string,
  apiKey: string | null,
  signal: AbortSignal
): Promise<string[]> {
  const response = await fetch(baseURL.replace(/\/+$/, '') + '/models', {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  const json = (await response.json()) as { data?: unknown };
  if (!Array.isArray(json.data)) {
    throw new Error('Unexpected response');
  }
  return json.data
    .map((model: { id?: unknown }) => model?.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}
