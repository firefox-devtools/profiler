# Profile chat

The profile chat is an experimental drawer that answers questions about the open profile. It sends the conversation directly from the browser to a model provider the user picks: Anthropic, OpenAI, OpenRouter, a model running locally, or any OpenAI-compatible server. There is no server on our side. The model inspects the profile by running [profiler-cli](../profiler-cli/README.md) (pq) commands against the page's own Redux store.

## Enabling it

The feature is hidden behind a `localStorage` flag. Run this in the console and reload:

```js
localStorage.setItem('profiler.chat.enabled', 'true');
```

An "Ask about this profile" button then appears in the top bar. The first time, the drawer shows the provider settings. "Settings" in the drawer header opens them again. Nothing about the chat is URL state, so a reload starts a new conversation.

## Providers

| Preset                         | Wire format      | Base URL                                        | Needs                                           |
| ------------------------------ | ---------------- | ----------------------------------------------- | ----------------------------------------------- |
| Anthropic                      | Messages API     | `api.anthropic.com`                             | API key. The model is fixed.                    |
| OpenAI                         | Responses API    | `https://api.openai.com/v1`                     | API key, model                                  |
| OpenRouter                     | Chat Completions | `https://openrouter.ai/api/v1`                  | API key ("Connect OpenRouter" or pasted), model |
| Local model                    | Chat Completions | `http://localhost:11434/v1` by default (Ollama) | Model. The key is optional.                     |
| Other OpenAI-compatible server | Chat Completions | Entered by the user                             | Base URL, model. The key is optional.           |

The presets are defined in `src/app-logic/profile-chat/provider-settings.ts`. OpenAI uses the Responses API (`providers/openai-responses.ts`), because OpenAI's Chat Completions endpoint rejects function tools together with reasoning on some models. The other presets use the same Chat Completions provider, `providers/openai-chat.ts`, with a different base URL, because that's the API those servers implement. The settings are stored in `localStorage`: `profiler.chat.provider` holds the selected preset, and `profiler.chat.settings.<preset>` holds `{ apiKey?, baseURL?, model? }` as JSON, so switching between presets keeps each one's settings. "Forget key" removes the key and keeps the rest.

For OpenAI-compatible presets the form suggests models from `GET {baseURL}/models`. The user can also type a model name, for servers where the list fails or is incomplete. On OpenRouter the list only shows models whose `supported_parameters` include `tools`. The chat needs a model with tool calling and a long context window: the system prompt alone is about 11k tokens, before any tool output. Small local models may use pq badly, or keep calling it until the 25 tool rounds limit.

Switching to another preset starts a new chat, because each provider keeps its conversation in its own message format (see [The conversation](#the-conversation)).

### Organizations with custom data retention

Anthropic doesn't accept requests from a browser for organizations with custom data retention settings, such as zero data retention. Their keys fail with "CORS requests are not allowed for this Organization because of custom retention settings", so the chat needs a key from an organization without such settings. The drawer shows the API's error message and keeps the key, because a rejected key can't be told apart from an organization policy.

### Connect OpenRouter

OpenRouter supports an [OAuth PKCE flow](https://openrouter.ai/docs/use-cases/oauth-pkce) that gives the user an API key without a server on our side, which is the closest the chat gets to "sign in". The flow is in `src/app-logic/profile-chat/providers/openrouter-auth.ts`:

1. When the OpenRouter preset is shown, the form prepares a code verifier, its S256 challenge and a `state`. This is async (`crypto.subtle`), so it happens before the click: `window.open` has to run synchronously in the click handler, or popup blockers stop it.
2. "Connect OpenRouter" opens `https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256&state=…&key_label=Firefox%20Profiler` in a popup. A redirect would unload the page, and a profile loaded from a file can't be reloaded.
3. OpenRouter redirects the popup to `/oauth/openrouter-callback.html?code=…&state=…`. That static page (`res/oauth/`, with a separate script because the CSP doesn't allow inline scripts) posts `{ code, state }` on the `profiler-openrouter-auth` `BroadcastChannel` and closes itself. The channel doesn't depend on `window.opener`, which an opener policy on the auth pages could cut off.
4. The drawer ignores messages with another `state`, then exchanges the code at `POST https://openrouter.ai/api/v1/auth/keys` with the verifier. Codes are single-use and valid for 10 minutes. The key is stored right away, even before the user saves the form, because it now exists in the user's OpenRouter account. Users can revoke it in their OpenRouter key settings.
5. When the user denies access, OpenRouter redirects without a code and without the `state`, so that message can't be matched to its sign-in. The drawer treats it as a cancelled sign-in. It also gives up after 10 minutes, when the code would have expired anyway. Closing the popup isn't detected, because an opener policy can make `popup.closed` unreliable.

The build copies `res/oauth/` to `dist/oauth/`. Netlify and the dev server serve existing files before the SPA fallback, and `workbox-config.js` excludes `/oauth/` from the service worker's navigation fallback. Without that, the query string would keep the precached page from matching and the service worker would answer with `index.html`.

To test the flow without an OpenRouter account, open the popup and replace its URL with the callback URL and the `state` from the auth URL. The exchange then fails with OpenRouter's error message, unless `fetch` is stubbed for `/auth/keys`.

### Local models

The Local preset talks to the OpenAI-compatible API of a server on the user's machine, such as Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`). Browsers allow pages on `https` to fetch from `http://localhost`, though Chrome may first ask the user for permission to access devices on the local network. The server also has to allow the profiler's origin with CORS:

- Ollama allows a few local origins by default. Add the profiler's origin with the `OLLAMA_ORIGINS` environment variable, for example `OLLAMA_ORIGINS=https://profiler.firefox.com ollama serve`, or `http://localhost:4242` for a development build. When Ollama runs as the macOS app, set it with `launchctl setenv OLLAMA_ORIGINS https://profiler.firefox.com` and restart the app. See the [Ollama FAQ](https://docs.ollama.com/faq) for other platforms.
- LM Studio has a CORS option in its server settings.

When the server can't be reached, the error says so and points at `OLLAMA_ORIGINS`, because a CORS failure looks like a connection error to the page.

## Privacy

Questions, and whatever the model reads from the profile to answer them (function names, URLs, marker payloads, and so on), are sent to the selected provider. The settings form says where for each preset:

- Anthropic and OpenAI: sent to that company.
- OpenRouter: sent to OpenRouter and to the provider of the model the user picks.
- Local model: stays on the machine, unless the URL points to another one.
- Other OpenAI-compatible server: sent to the configured URL.

The chat sends whatever profile is loaded, so a profile that hasn't been sanitized can still contain private data. API keys are stored in `localStorage`, in this browser only.

## Architecture

```
ChatDrawer (src/components/chat)
   |  dispatch(sendChatMessage(text))
   v
thunks (src/actions/chat.ts)              state.chat (src/reducers/chat.ts)
   |  runChatTurn(provider, ...)             conversation, status, streamingText, ...
   v
chat-engine.ts  ->  providers/anthropic.ts    ->  Anthropic SDK -> api.anthropic.com
   |            ->  providers/openai-responses.ts -> openai SDK -> api.openai.com/v1/responses
   |            ->  providers/openai-chat.ts  ->  openai SDK    -> {baseURL}/chat/completions
   |  run_profiler_cli tool calls
   v
pq-browser-executor.ts
   |  commander + the shared pq command definitions (src/profile-query/cli)
   v
ProfileQuerier on the live store (src/profile-query)
```

- `src/app-logic/profile-chat/chat-engine.ts`: the agentic loop. It streams one response, runs the tool calls the model asks for, and repeats until the model ends its turn. It doesn't know about Redux or about a particular API, which keeps it testable with a mocked `fetch`.
- `src/app-logic/profile-chat/providers/`: one `ChatProvider` per wire format (`types.ts`). A provider builds the user and tool result messages, streams a response and classifies errors. `transcript.ts` turns a conversation into the rendered transcript without importing an SDK, because a selector uses it.
- `src/app-logic/profile-chat/pq-browser-executor.ts`: runs one pq command line on the store and returns its text output. Usage errors, unknown commands and failing queries come back as errors rather than exceptions, so the model can read and fix them. Output is truncated at 32 KB.
- `src/app-logic/profile-chat/system-prompt.ts`: an intro plus `profiler-cli/guide.txt` and `profiler-cli/schemas.txt`. It is the same for every request, so it's cached.
- `src/app-logic/profile-chat/view-context.ts`: every user message ends with a `<current_view>` block (selected tab, plus the `status` output for the selected thread, committed ranges and filters), so "this" and "here" mean what the user is looking at. The block isn't shown in the transcript.
- `src/app-logic/profile-chat/provider-settings.ts`: the presets and their `localStorage` settings. It's imported by the reducer, so it must not import an SDK. The model list uses `fetch` for the same reason.
- The thunks load the SDK of the selected provider, the engine and the executor with a dynamic `import()`, and `ProfileViewer` loads the drawer lazily, so none of it is in the main bundle. Each SDK is in its own chunk (about 340 KB for Anthropic and 380 KB for openai, minified), loaded only when that provider is used.

The commands run on the live store, so `thread select`, `zoom push` and `filter push` change the UI. Every command shows up as a chip in the transcript, so the user can see why the view changed.

### The conversation

`state.chat.conversation` holds the messages exactly as they're sent to the API, tagged with their format (`anthropic`, `openai-responses` or `openai-chat`), and the transcript is a selector over it. Nothing is translated between formats, so switching provider starts a new conversation. The history is append-only: assistant messages are kept unchanged, including Anthropic's thinking blocks, OpenAI's encrypted reasoning items and OpenRouter's `reasoning_details`, which models need in later requests to keep their reasoning across tool calls. Every tool call gets a result in the next message, also when the turn is stopped, cut off by the token limit, or stopped by the 25 tool rounds limit. In those cases the remaining calls get an error result.

The formats differ in a few places:

- Anthropic and Responses user messages have the text and the view context as two text parts. Chat Completions user messages are one string, with the view context after a blank line, because some compatible servers only accept strings.
- Anthropic answers all tool calls in one user message with `tool_result` blocks, which have an `is_error` flag. Chat Completions has one `role: 'tool'` message per call, and Responses one `function_call_output` item per call. Neither has an error flag, so failed commands start with `Error: `, which the transcript uses to show them as errors.
- Some OpenAI-compatible servers end a response that has tool calls with `finish_reason: 'stop'`, so the tool calls are run whatever the finish reason, except `length` and `content_filter`.

"New chat" and loading another profile start a new conversation. A turn that is still running for the old one is aborted, and its results are dropped by comparing `conversationId`.

### Commander in the browser

commander imports `node:events`, `node:process`, `node:fs`, `node:path`, `node:child_process` and `node:util` at module level. The web build redirects those imports to small shims in `src/utils/node-shims/` (`commanderNodeShimsPlugin` in `scripts/lib/esbuild-plugins.mjs`). That's enough because the executor only parses with `{ from: 'user' }`, `exitOverride()` and `configureOutput()`, and never spawns subcommands. Commands that need a file system (`profile save`, `sourcemap apply`) aren't registered in the browser.

## Model and request settings

All providers stream responses, and the visible text is dispatched at most every 50ms. They all get the same system prompt and one tool, `run_profiler_cli`, that takes a command line string.

Anthropic:

- Model `claude-opus-5-5`, with `output_config.effort: 'medium'`. Thinking is adaptive, which is the default for this model.
- Refused requests are retried on another model with the server-side fallback beta (`fallbacks: 'default'`).
- The tool is strict. The system prompt is cached, and so is the conversation up to the last message, so that each tool round only pays in full for what the previous one added.

OpenAI (Responses API):

- The model the user picked, with its default reasoning effort and token limit.
- `store: false`, so OpenAI doesn't keep the conversation, with `include: ['reasoning.encrypted_content']` so that the reasoning items can be sent back. The system prompt goes in `instructions`, and OpenAI caches long prompt prefixes automatically.
- The tool is strict.

Other OpenAI-compatible presets (Chat Completions):

- The model the user picked, with the server's default token limit and reasoning settings.
- The system prompt is a `system` message at the start of every request. Servers may not cache it, so long chats can cost more there.
- The tool isn't strict, because other servers than OpenAI may reject the field.
- Reasoning text, when a server sends it, isn't shown.

With both APIs, tool arguments are parsed and checked, and malformed ones are answered with an error the model can read.
