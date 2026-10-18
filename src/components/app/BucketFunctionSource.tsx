/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useEffect, useMemo, useState } from 'react';

import { SourceView } from 'firefox-profiler/components/shared/SourceView';
import { getBucketFunctionSources } from 'firefox-profiler/profile-logic/benchmark/bucket-function-source';
import { extractFunctionSourceInWorker } from 'firefox-profiler/profile-logic/js-format/run-format-worker';

import type {
  BucketFunctionSources,
  FunctionSourceView,
} from 'firefox-profiler/profile-logic/benchmark/bucket-function-source';
import type { FunctionSource } from 'firefox-profiler/profile-logic/js-format/function-source';
import type {
  IndexIntoFuncTable,
  LineTimings,
  Profile,
} from 'firefox-profiler/types';

// The results of the worker, per profile, so that collapsing and expanding a
// bucket again doesn't parse the file again.
const _functionSourceCache: WeakMap<
  Profile,
  Map<string, Promise<FunctionSource | null>>
> = new WeakMap();

function _getFunctionSource(
  profile: Profile,
  view: FunctionSourceView
): Promise<FunctionSource | null> {
  let cache = _functionSourceCache.get(profile);
  if (cache === undefined) {
    cache = new Map();
    _functionSourceCache.set(profile, cache);
  }
  const { line, column, format } = view.request;
  const key = `${view.sourceIndex}:${line}:${column}:${format}`;
  let promise = cache.get(key);
  if (promise === undefined) {
    promise = extractFunctionSourceInWorker(view.request);
    cache.set(key, promise);
  }
  return promise;
}

type FunctionSourceState =
  | { status: 'loading' }
  | { status: 'done'; functionSource: FunctionSource | null }
  | { status: 'error' };

function useFunctionSource(
  profile: Profile,
  view: FunctionSourceView
): FunctionSourceState {
  const [state, setState] = useState<{
    view: FunctionSourceView;
    result: FunctionSourceState;
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    _getFunctionSource(profile, view).then(
      (functionSource) => {
        if (isCurrent) {
          setState({ view, result: { status: 'done', functionSource } });
        }
      },
      (error) => {
        console.error('Extracting the function source failed:', error);
        if (isCurrent) {
          setState({ view, result: { status: 'error' } });
        }
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [profile, view]);

  // Ignore a result for a previous view.
  return state !== null && state.view === view
    ? state.result
    : { status: 'loading' };
}

const NO_TIMINGS: LineTimings = {
  totalLineHits: new Map(),
  selfLineHits: new Map(),
};

// The source view grows with the code up to this many lines, and scrolls
// after that.
const MAX_VISIBLE_LINES = 30;
// Matches the line height of the source view, see CodeView.css.
const LINE_HEIGHT_PX = 16;
// The height of the source view's header, plus some space for a horizontal
// scrollbar.
const SOURCE_VIEW_EXTRA_HEIGHT_PX = 36;

function FunctionSourcePanel({
  profile,
  view,
  title,
}: {
  profile: Profile;
  view: FunctionSourceView;
  title: string;
}) {
  const state = useFunctionSource(profile, view);

  let content;
  if (state.status === 'loading') {
    content = <div className="bucketFunctionSource__message">Loading…</div>;
  } else if (state.status === 'error' || state.functionSource === null) {
    content = (
      <div className="bucketFunctionSource__message">
        The function couldn’t be found in this file.
      </div>
    );
  } else {
    const { lines, firstLine } = state.functionSource;
    const visibleLines = Math.min(lines.length, MAX_VISIBLE_LINES);
    content = (
      <div
        className="bucketFunctionSource__code"
        style={{
          height: visibleLines * LINE_HEIGHT_PX + SOURCE_VIEW_EXTRA_HEIGHT_PX,
        }}
      >
        <SourceView
          timings={NO_TIMINGS}
          sourceCode={lines.join('\n')}
          formattedLines={null}
          filePath={view.filename}
          scrollGeneration={0}
          highlightedLine={null}
          startLine={
            firstLine === null ? 1 : firstLine + view.sourceStartLine - 1
          }
        />
      </div>
    );
  }

  return (
    <div className="bucketFunctionSource__panel">
      <div className="bucketFunctionSource__label" title={view.filename}>
        {title}
        <span className="bucketFunctionSource__filename">{view.filename}</span>
      </div>
      {content}
    </div>
  );
}

function FunctionSourceRow({
  profile,
  sources,
  label,
}: {
  profile: Profile;
  sources: BucketFunctionSources;
  label: string | null;
}) {
  const { original, generated } = sources;
  const prefix = label === null ? '' : `${label}: `;
  return (
    <div className="bucketFunctionSource__row">
      {original !== null ? (
        <FunctionSourcePanel
          profile={profile}
          view={original}
          title={`${prefix}Original source`}
        />
      ) : null}
      {generated !== null ? (
        <FunctionSourcePanel
          profile={profile}
          view={generated}
          title={
            original !== null
              ? `${prefix}Generated source, pretty-printed`
              : `${prefix}Source`
          }
        />
      ) : null}
    </div>
  );
}

function _isSameView(
  a: FunctionSourceView | null,
  b: FunctionSourceView | null
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.filename === b.filename &&
    a.request.line === b.request.line &&
    a.request.column === b.request.column &&
    a.request.code === b.request.code
  );
}

function _hasAnySource(sources: BucketFunctionSources | null): boolean {
  return (
    sources !== null &&
    (sources.original !== null || sources.generated !== null)
  );
}

type Props = {
  baseProfile: Profile;
  newProfile: Profile;
  baseFunc: IndexIntoFuncTable | null;
  newFunc: IndexIntoFuncTable | null;
  baseLabel: string;
  newLabel: string;
};

/**
 * Shows the code of the bucket's JS function, both the original code from
 * the source map and the generated code that the browser ran. When both
 * profiles ran the same code, it's only shown once.
 */
export function BucketFunctionSource({
  baseProfile,
  newProfile,
  baseFunc,
  newFunc,
  baseLabel,
  newLabel,
}: Props) {
  const baseSources = useMemo(
    () =>
      baseFunc === null
        ? null
        : getBucketFunctionSources(baseProfile, baseFunc),
    [baseProfile, baseFunc]
  );
  const newSources = useMemo(
    () =>
      newFunc === null ? null : getBucketFunctionSources(newProfile, newFunc),
    [newProfile, newFunc]
  );

  // Comparing the code can mean comparing two copies of a large bundle, so
  // only do it when the functions change.
  const isSame = useMemo(
    () =>
      baseSources !== null &&
      newSources !== null &&
      _isSameView(baseSources.original, newSources.original) &&
      _isSameView(baseSources.generated, newSources.generated),
    [baseSources, newSources]
  );

  const hasBase = _hasAnySource(baseSources);
  const hasNew = _hasAnySource(newSources);
  if (!hasBase && !hasNew) {
    return null;
  }

  return (
    <div className="bucketFunctionSource">
      {hasBase && baseSources !== null ? (
        <FunctionSourceRow
          profile={baseProfile}
          sources={baseSources}
          label={isSame ? null : baseLabel}
        />
      ) : null}
      {hasNew && newSources !== null && !isSame ? (
        <FunctionSourceRow
          profile={newProfile}
          sources={newSources}
          label={newLabel}
        />
      ) : null}
    </div>
  );
}
