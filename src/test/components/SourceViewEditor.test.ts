/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { waitFor } from '@testing-library/react';
import { LanguageDescription, language } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

import { SourceViewEditor } from 'firefox-profiler/components/shared/SourceView-codemirror';

describe('SourceViewEditor syntax highlighting', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function setup(text: string, path: string) {
    const timings = { totalLineHits: new Map(), selfLineHits: new Map() };
    return new SourceViewEditor(
      text,
      path,
      timings,
      null,
      1,
      container,
      () => {}
    );
  }

  // The classHighlighter puts a tok-* class on each highlighted token.
  function classesOfToken(token: string): string[] {
    return Array.from(container.querySelectorAll('.cm-line span'))
      .filter((span) => span.textContent === token)
      .map((span) => span.className);
  }

  // Wait for the language @codemirror/language-data would pick for this exact
  // string, in case the editor wrongly started loading it.
  async function waitForLanguageMatching(path: string) {
    await LanguageDescription.matchFilename(languages, path)?.load();
  }

  it('highlights a language that is only known to @codemirror/language-data', async () => {
    setup('def main():\n    return None\n', 'src/app/main.py');
    await waitFor(() => expect(classesOfToken('def')).toEqual(['tok-keyword']));
    expect(classesOfToken('None')).toEqual(['tok-keyword']);
  });

  it('matches languages by file name, not by the whole path', async () => {
    setup('FROM ubuntu\n', 'tools/docker/Dockerfile');
    await waitFor(() =>
      expect(classesOfToken('FROM')).toEqual(['tok-keyword'])
    );
  });

  it('highlights the bundled languages right away', () => {
    setup('namespace mozilla {}\n', 'xpcom/base/nsCOMPtr.hh');
    expect(classesOfToken('namespace')).toEqual(['tok-keyword']);
  });

  for (const path of [
    // Inline scripts use the page URL as their path.
    'https://example.com/index.html',
    'https://github.com/mozilla/gecko-dev/blob/master/README.md',
    'https://example.com/page',
    // Script URLs often end in a query string.
    'https://example.com/jquery.min.js?ver=3.7.1',
  ]) {
    it(`keeps JavaScript highlighting for ${path}`, async () => {
      setup('const answer = 42;\n', path);
      await waitForLanguageMatching(path);
      expect(classesOfToken('const')).toEqual(['tok-keyword']);
    });
  }

  it('does not let a slow language load override a later file path', async () => {
    // No other test loads Go, so it's still loading when the path changes.
    const editor = setup('fn main() {}\n', 'cmd/main.go');
    editor.updateLanguageForFilePath('src/main.rs');
    await waitForLanguageMatching('main.go');
    expect(editor._view.state.facet(language)?.name).toBe('rust');
  });
});
