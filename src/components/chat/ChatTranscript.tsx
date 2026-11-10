/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import classNames from 'classnames';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type {
  ChatError,
  ChatProviderPreset,
  ChatStatus,
  ChatTranscriptItem,
  ChatTurnOutcome,
} from 'firefox-profiler/types';

type Props = {
  readonly items: ChatTranscriptItem[];
  readonly preset: ChatProviderPreset;
  readonly streamingText: string;
  readonly status: ChatStatus;
  readonly notice: ChatTurnOutcome | null;
  readonly error: ChatError | null;
};

const MARKDOWN_COMPONENTS = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={props.href} target="_blank" rel="noopener noreferrer">
      {props.children}
    </a>
  ),
};

// GitHub-flavored markdown, mostly for tables, which models often use to
// summarize profiler-cli output.
const REMARK_PLUGINS = [remarkGfm];

// Memoized, because the transcript renders again for each streamed update and
// parsing all the finished answers again each time is slow.
const ChatMarkdown = React.memo(function ChatMarkdown({
  text,
}: {
  readonly text: string;
}) {
  // react-markdown doesn't render raw HTML unless a plugin enables it. Images
  // are dropped because loading one sends a request without a click, so a
  // prompt injection in the profile could leak profile data in its URL.
  return (
    <div className="chatMarkdown">
      <Markdown
        components={MARKDOWN_COMPONENTS}
        remarkPlugins={REMARK_PLUGINS}
        disallowedElements={['img']}
      >
        {text}
      </Markdown>
    </div>
  );
});

function ChatNotice({ notice }: { readonly notice: ChatTurnOutcome }) {
  switch (notice.type) {
    case 'done':
      return null;
    case 'cancelled':
      return (
        <Localized id="ChatTranscript--notice-cancelled">
          <p className="chatNotice">Stopped.</p>
        </Localized>
      );
    case 'max-tokens':
      return (
        <Localized id="ChatTranscript--notice-max-tokens">
          <p className="chatNotice">
            The response was cut off because it got too long.
          </p>
        </Localized>
      );
    case 'tool-limit':
      return (
        <Localized id="ChatTranscript--notice-tool-limit">
          <p className="chatNotice">
            Stopped after too many profiler commands. Ask a narrower question,
            or send “continue”.
          </p>
        </Localized>
      );
    case 'refusal':
      return notice.explanation === null ? (
        <Localized id="ChatTranscript--notice-refusal">
          <p className="chatNotice">The response was declined.</p>
        </Localized>
      ) : (
        <Localized
          id="ChatTranscript--notice-refusal-with-explanation"
          vars={{ explanation: notice.explanation }}
        >
          <p className="chatNotice">
            The response was declined: {notice.explanation}
          </p>
        </Localized>
      );
    default:
      throw assertExhaustiveCheck(notice);
  }
}

type ErrorProps = {
  readonly error: ChatError;
  // The provider of the conversation, which the error came from.
  readonly preset: ChatProviderPreset;
};

export function ChatErrorMessage({ error, preset }: ErrorProps) {
  switch (error.type) {
    case 'auth':
      return (
        <Localized
          id="ChatError--auth-rejected"
          vars={{ provider: error.provider, message: error.message }}
        >
          <p className="chatError">
            {error.provider} rejected the API key: {error.message} Open
            “Settings” to enter a different one.
          </p>
        </Localized>
      );
    case 'rate-limit':
      return (
        <Localized
          id="ChatError--rate-limited"
          vars={{ provider: error.provider }}
        >
          <p className="chatError">
            {error.provider} is rate limiting requests. Wait a bit and try
            again.
          </p>
        </Localized>
      );
    case 'permission':
      return (
        <Localized id="ChatError--permission" vars={{ message: error.message }}>
          <p className="chatError">
            This API key is not allowed to use the model: {error.message}
          </p>
        </Localized>
      );
    case 'connection':
      return (
        <>
          <Localized
            id="ChatError--connection-failed"
            vars={{ provider: error.provider, message: error.message }}
          >
            <p className="chatError">
              Could not reach {error.provider}: {error.message}
            </p>
          </Localized>
          {preset === 'local' ? (
            <Localized id="ChatError--connection-local-hint">
              <p className="chatError">
                Check that the server is running and allows requests from this
                site. For Ollama, set OLLAMA_ORIGINS.
              </p>
            </Localized>
          ) : null}
        </>
      );
    case 'api':
    case 'unknown':
      return (
        <Localized id="ChatError--other" vars={{ message: error.message }}>
          <p className="chatError">Something went wrong: {error.message}</p>
        </Localized>
      );
    default:
      throw assertExhaustiveCheck(error);
  }
}

type ToolCallProps = {
  readonly command: string;
  readonly result: { readonly text: string; readonly isError: boolean } | null;
};

/**
 * A profiler-cli command the model ran, collapsed to the command line, so the
 * user can see why the view changed and expand it to see what the model saw.
 */
export function ChatToolCallChip({ command, result }: ToolCallProps) {
  return (
    <details
      className={classNames('chatToolCall', {
        chatToolCallRunning: result === null,
        chatToolCallError: result?.isError,
      })}
    >
      <summary className="chatToolCallSummary">
        <code>pq {command}</code>
      </summary>
      {result !== null ? (
        <pre className="chatToolCallOutput">{result.text}</pre>
      ) : null}
    </details>
  );
}

export function ChatTranscript({
  items,
  preset,
  streamingText,
  status,
  notice,
  error,
}: Props) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const isNearBottomRef = React.useRef(true);

  const onScroll = React.useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      isNearBottomRef.current =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 40;
    }
  }, []);

  // Follow new content, unless the user scrolled up to read.
  React.useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller && isNearBottomRef.current) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [items, streamingText, status, notice, error]);

  return (
    <div className="chatTranscript" ref={scrollerRef} onScroll={onScroll}>
      {items.length === 0 ? (
        <Localized id="ChatTranscript--empty">
          <p className="chatTranscriptEmpty">
            Ask a question about this profile, for example “Which functions take
            the most time on the main thread?”
          </p>
        </Localized>
      ) : null}
      {items.map((item, index) => {
        switch (item.type) {
          case 'user':
            return (
              <div key={index} className="chatMessage chatMessageUser">
                {item.text}
              </div>
            );
          case 'assistant':
            return (
              <div key={index} className="chatMessage chatMessageAssistant">
                <ChatMarkdown text={item.text} />
              </div>
            );
          case 'tool-call':
            return (
              <ChatToolCallChip
                key={item.id}
                command={item.command}
                result={item.result}
              />
            );
          default:
            return null;
        }
      })}
      {streamingText !== '' ? (
        <div className="chatMessage chatMessageAssistant">
          <ChatMarkdown text={streamingText} />
        </div>
      ) : null}
      {status === 'streaming' && streamingText === '' ? (
        <Localized id="ChatTranscript--thinking">
          <p className="chatTranscriptThinking">Thinking…</p>
        </Localized>
      ) : null}
      {notice !== null ? <ChatNotice notice={notice} /> : null}
      {error !== null ? (
        <ChatErrorMessage error={error} preset={preset} />
      ) : null}
    </div>
  );
}
