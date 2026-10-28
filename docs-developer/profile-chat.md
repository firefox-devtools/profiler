# Profile chat

The profile chat is an experimental drawer that answers questions about the open profile. It sends the conversation to the Anthropic Messages API directly from the browser, using an API key that the user enters. The model inspects the profile by running [profiler-cli](../profiler-cli/README.md) (pq) commands against the page's own Redux store.

## Enabling it

The feature is hidden behind a `localStorage` flag. Run this in the console and reload:

```js
localStorage.setItem('profiler.chat.enabled', 'true');
```

An "Ask about this profile" button then appears in the top bar. The first time, the drawer asks for an Anthropic API key. It is stored in `localStorage` under `profiler.chat.anthropicApiKey` until the user clicks "Forget key". Nothing about the chat is URL state, so a reload starts a new conversation.

### Organizations with custom data retention

Anthropic doesn't accept requests from a browser for organizations with custom data retention settings, such as zero data retention. Their keys fail with "CORS requests are not allowed for this Organization because of custom retention settings", so the chat needs a key from an organization without such settings. The drawer shows the API's error message and keeps the key, because a rejected key can't be told apart from an organization policy.

## Privacy

Questions, and whatever the model reads from the profile to answer them (function names, URLs, marker payloads, and so on), are sent to Anthropic. The key form says so. The chat sends whatever profile is loaded, so a profile that hasn't been sanitized can still contain private data.

## Architecture

```
ChatDrawer (src/components/chat)
   |  dispatch(sendChatMessage(text))
   v
thunks (src/actions/chat.ts)              state.chat (src/reducers/chat.ts)
   |  runChatTurn(provider, ...)             conversation, status, streamingText, ...
   v
chat-engine.ts  ->  providers/anthropic.ts  ->  Anthropic SDK -> api.anthropic.com
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
- The thunks load the SDK, the engine and the executor with a dynamic `import()`, and `ProfileViewer` loads the drawer lazily, so none of it is in the main bundle.

The commands run on the live store, so `thread select`, `zoom push` and `filter push` change the UI. Every command shows up as a chip in the transcript, so the user can see why the view changed.

### The conversation

`state.chat.conversation` holds the messages exactly as they're sent to the API, in the provider's own format, and the transcript is a selector over it. The history is append-only: assistant messages are kept unchanged, including their thinking blocks, which the API requires for later requests. Every tool call gets a result in the next message, also when the turn is stopped, cut off by `max_tokens`, or stopped by the 25 tool rounds limit. In those cases the remaining calls get an error result.

"New chat" and loading another profile start a new conversation. A turn that is still running for the old one is aborted, and its results are dropped by comparing `conversationId`.

### Commander in the browser

commander imports `node:events`, `node:process`, `node:fs`, `node:path`, `node:child_process` and `node:util` at module level. The web build redirects those imports to small shims in `src/utils/node-shims/` (`commanderNodeShimsPlugin` in `scripts/lib/esbuild-plugins.mjs`). That's enough because the executor only parses with `{ from: 'user' }`, `exitOverride()` and `configureOutput()`, and never spawns subcommands. Commands that need a file system (`profile save`, `sourcemap apply`) aren't registered in the browser.

## Model and request settings

- Model `claude-opus-5-5`, with `output_config.effort: 'medium'`. Thinking is adaptive, which is the default for this model.
- Responses are streamed, and the visible text is dispatched at most every 50ms.
- Refused requests are retried on another model with the server-side fallback beta (`fallbacks: 'default'`).
- One strict tool, `run_profiler_cli`, that takes a command line string.
