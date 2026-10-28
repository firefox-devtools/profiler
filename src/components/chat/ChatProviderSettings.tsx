/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';
import {
  CHAT_PROVIDER_PRESETS,
  CHAT_PROVIDER_PRESET_ORDER,
  fetchModelList,
  getBaseURL,
  getStoredProviderSettings,
  hasCompleteSettings,
  type ChatProviderSettings as Settings,
} from 'firefox-profiler/app-logic/profile-chat/provider-settings';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { ChatErrorMessage } from './ChatTranscript';
import type { ChatError, ChatProviderPreset } from 'firefox-profiler/types';

type Props = {
  // The selected provider.
  readonly preset: ChatProviderPreset;
  readonly error: ChatError | null;
  readonly onSave: (preset: ChatProviderPreset, settings: Settings) => void;
  readonly onForgetApiKey: () => void;
  // Null when there's nothing to go back to.
  readonly onCancel: (() => void) | null;
};

type ModelList =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly models: string[] }
  | { readonly status: 'error'; readonly message: string };

// Wait for the user to stop typing a URL or key before fetching models.
const MODEL_LIST_DELAY_MS = 500;

const LOCAL_MODELS_DOCS_URL =
  'https://github.com/firefox-devtools/profiler/blob/main/docs-developer/profile-chat.md#local-models';

function _link(href: string) {
  return <a href={href} target="_blank" rel="noopener noreferrer" />;
}

function PresetDescription({
  preset,
}: {
  readonly preset: ChatProviderPreset;
}) {
  switch (preset) {
    case 'anthropic':
      return (
        <Localized
          id="ChatProviderSettings--description-anthropic"
          elems={{ a: _link('https://console.anthropic.com/settings/keys') }}
        >
          <p>
            Enter an <a>Anthropic API key</a> to ask questions about this
            profile.
          </p>
        </Localized>
      );
    case 'openai':
      return (
        <Localized
          id="ChatProviderSettings--description-openai"
          elems={{ a: _link('https://platform.openai.com/api-keys') }}
        >
          <p>
            Enter an <a>OpenAI API key</a> and pick a model to ask questions
            about this profile.
          </p>
        </Localized>
      );
    case 'local':
      return (
        <Localized
          id="ChatProviderSettings--description-local"
          elems={{ a: _link(LOCAL_MODELS_DOCS_URL) }}
        >
          <p>
            Use a model running on this computer, through its OpenAI-compatible
            API. The model needs to support tool calling and a long context.
            Ollama needs to allow requests from this site, see the{' '}
            <a>documentation</a>.
          </p>
        </Localized>
      );
    case 'custom':
      return (
        <Localized id="ChatProviderSettings--description-custom">
          <p>
            Use any server that implements the OpenAI Chat Completions API, such
            as a company gateway. The model needs to support tool calling.
          </p>
        </Localized>
      );
    default:
      throw assertExhaustiveCheck(preset);
  }
}

const PRESET_LABELS: {
  readonly [K in ChatProviderPreset]: { l10nId: string; fallback: string };
} = {
  anthropic: {
    l10nId: 'ChatProviderSettings--provider-anthropic',
    fallback: 'Anthropic',
  },
  openai: {
    l10nId: 'ChatProviderSettings--provider-openai',
    fallback: 'OpenAI',
  },
  local: {
    l10nId: 'ChatProviderSettings--provider-local',
    fallback: 'Local model (Ollama, LM Studio)',
  },
  custom: {
    l10nId: 'ChatProviderSettings--provider-custom',
    fallback: 'Other OpenAI-compatible server',
  },
};

function PresetPrivacy({ preset }: { readonly preset: ChatProviderPreset }) {
  switch (preset) {
    case 'anthropic':
      return (
        <Localized id="ChatProviderSettings--privacy-anthropic">
          <p className="chatProviderSettingsPrivacy">
            Settings are stored in this browser only. Your questions and the
            parts of the profile needed to answer them, such as function names,
            URLs and marker data, are sent to Anthropic.
          </p>
        </Localized>
      );
    case 'openai':
      return (
        <Localized id="ChatProviderSettings--privacy-openai">
          <p className="chatProviderSettingsPrivacy">
            Settings are stored in this browser only. Your questions and the
            parts of the profile needed to answer them, such as function names,
            URLs and marker data, are sent to OpenAI.
          </p>
        </Localized>
      );
    case 'local':
      return (
        <Localized id="ChatProviderSettings--privacy-local">
          <p className="chatProviderSettingsPrivacy">
            Settings are stored in this browser only. Your questions and the
            parts of the profile needed to answer them stay on this computer,
            unless the URL points to another machine.
          </p>
        </Localized>
      );
    case 'custom':
      return (
        <Localized id="ChatProviderSettings--privacy-custom">
          <p className="chatProviderSettingsPrivacy">
            Settings are stored in this browser only. Your questions and the
            parts of the profile needed to answer them, such as function names,
            URLs and marker data, are sent to the server at this URL.
          </p>
        </Localized>
      );
    default:
      throw assertExhaustiveCheck(preset);
  }
}

/**
 * Fetch the model list of an OpenAI-compatible endpoint while the form is
 * shown, so that the model field can suggest them.
 */
function useModelList(
  preset: ChatProviderPreset,
  baseURL: string,
  apiKey: string
): ModelList {
  const [modelList, setModelList] = React.useState<ModelList>({
    status: 'none',
  });
  const info = CHAT_PROVIDER_PRESETS[preset];
  const canFetch =
    info.hasModelChoice &&
    baseURL !== '' &&
    (!info.requiresApiKey || apiKey !== '');

  React.useEffect(() => {
    if (!canFetch) {
      setModelList({ status: 'none' });
      return undefined;
    }
    setModelList({ status: 'loading' });
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchModelList(baseURL, apiKey || null, controller.signal).then(
        (models) => setModelList({ status: 'loaded', models }),
        (error) => {
          if (!controller.signal.aborted) {
            setModelList({ status: 'error', message: error.message });
          }
        }
      );
    }, MODEL_LIST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canFetch, baseURL, apiKey]);

  return modelList;
}

export function ChatProviderSettings({
  preset: selectedPreset,
  error,
  onSave,
  onForgetApiKey,
  onCancel,
}: Props) {
  const [preset, setPreset] = React.useState(selectedPreset);
  const [stored, setStored] = React.useState(() =>
    getStoredProviderSettings(selectedPreset)
  );
  const [apiKey, setApiKey] = React.useState(stored.apiKey ?? '');
  const [baseURL, setBaseURL] = React.useState(
    getBaseURL(selectedPreset, stored)
  );
  const [model, setModel] = React.useState(stored.model ?? '');
  const info = CHAT_PROVIDER_PRESETS[preset];
  const modelList = useModelList(preset, baseURL.trim(), apiKey.trim());
  const datalistId = React.useId();

  const onPresetChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newPreset = event.target.value as ChatProviderPreset;
      const settings = getStoredProviderSettings(newPreset);
      setPreset(newPreset);
      setStored(settings);
      setApiKey(settings.apiKey ?? '');
      setBaseURL(getBaseURL(newPreset, settings));
      setModel(settings.model ?? '');
    },
    []
  );

  const onBaseURLChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setBaseURL(event.target.value),
    []
  );
  const onApiKeyChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setApiKey(event.target.value),
    []
  );
  const onModelChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setModel(event.target.value),
    []
  );

  const settings: Settings = React.useMemo(() => {
    const { canChangeBaseURL, hasModelChoice } = CHAT_PROVIDER_PRESETS[preset];
    return {
      ...(apiKey.trim() !== '' ? { apiKey: apiKey.trim() } : {}),
      ...(canChangeBaseURL && baseURL.trim() !== ''
        ? { baseURL: baseURL.trim() }
        : {}),
      ...(hasModelChoice && model.trim() !== '' ? { model: model.trim() } : {}),
    };
  }, [preset, apiKey, baseURL, model]);
  const canSave = hasCompleteSettings(preset, settings);

  const onSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (canSave) {
        onSave(preset, settings);
      }
    },
    [canSave, onSave, preset, settings]
  );

  const onForgetApiKeyClick = React.useCallback(() => {
    onForgetApiKey();
    setApiKey('');
    setStored(getStoredProviderSettings(preset));
  }, [onForgetApiKey, preset]);

  return (
    <form className="chatProviderSettings" onSubmit={onSubmit}>
      <label className="chatProviderSettingsField">
        <Localized id="ChatProviderSettings--provider-label">
          <span>Provider</span>
        </Localized>
        <select
          className="chatProviderSettingsInput"
          value={preset}
          onChange={onPresetChange}
        >
          {CHAT_PROVIDER_PRESET_ORDER.map((value) => (
            <Localized key={value} id={PRESET_LABELS[value].l10nId}>
              <option value={value}>{PRESET_LABELS[value].fallback}</option>
            </Localized>
          ))}
        </select>
      </label>
      <PresetDescription preset={preset} />
      <PresetPrivacy preset={preset} />
      {error !== null && preset === selectedPreset ? (
        <ChatErrorMessage error={error} preset={selectedPreset} />
      ) : null}
      {info.canChangeBaseURL ? (
        <label className="chatProviderSettingsField">
          <Localized id="ChatProviderSettings--base-url-label">
            <span>Server URL</span>
          </Localized>
          <input
            className="chatProviderSettingsInput photon-input"
            type="url"
            placeholder={info.defaultBaseURL || 'https://example.com/v1'}
            value={baseURL}
            onChange={onBaseURLChange}
          />
        </label>
      ) : null}
      <label className="chatProviderSettingsField">
        {info.requiresApiKey ? (
          <Localized id="ChatProviderSettings--api-key-label">
            <span>API key</span>
          </Localized>
        ) : (
          <Localized id="ChatProviderSettings--api-key-optional-label">
            <span>API key (optional)</span>
          </Localized>
        )}
        <input
          className="chatProviderSettingsInput photon-input"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={onApiKeyChange}
        />
      </label>
      {info.hasModelChoice ? (
        <div className="chatProviderSettingsField">
          <label className="chatProviderSettingsField">
            <Localized id="ChatProviderSettings--model-label">
              <span>Model</span>
            </Localized>
            <Localized
              id="ChatProviderSettings--model-input"
              attrs={{ placeholder: true }}
            >
              <input
                className="chatProviderSettingsInput photon-input"
                type="text"
                autoComplete="off"
                list={datalistId}
                placeholder="Model name"
                value={model}
                onChange={onModelChange}
              />
            </Localized>
          </label>
          <datalist id={datalistId}>
            {modelList.status === 'loaded'
              ? modelList.models.map((id) => <option key={id} value={id} />)
              : null}
          </datalist>
          {modelList.status === 'loading' ? (
            <Localized id="ChatProviderSettings--models-loading">
              <span className="chatProviderSettingsHint">
                Loading the model list…
              </span>
            </Localized>
          ) : null}
          {modelList.status === 'error' ? (
            <Localized
              id="ChatProviderSettings--models-error"
              vars={{ message: modelList.message }}
            >
              <span className="chatProviderSettingsHint">
                Could not load the model list ({modelList.message}). Type the
                model name instead.
              </span>
            </Localized>
          ) : null}
        </div>
      ) : null}
      <div className="chatProviderSettingsButtons">
        <Localized id="ChatProviderSettings--save-button">
          <button
            className="photon-button photon-button-primary"
            type="submit"
            disabled={!canSave}
          >
            Save
          </button>
        </Localized>
        {onCancel !== null ? (
          <Localized id="ChatProviderSettings--cancel-button">
            <button className="photon-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          </Localized>
        ) : null}
        {preset === selectedPreset && stored.apiKey ? (
          <Localized id="ChatProviderSettings--forget-key-button">
            <button
              className="photon-button"
              type="button"
              onClick={onForgetApiKeyClick}
            >
              Forget key
            </button>
          </Localized>
        ) : null}
      </div>
    </form>
  );
}
