/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// Engine coupling — read this before adding modifiers
//
// Blink derives V8 binding func names from IDL by snake_case-ing the
// interface name (e.g. `HTMLCanvasElement` → `v8_html_canvas_element::...`).
// To match those frames in profiles we have to mirror Blink's exact
// snake_case algorithm — see Blink's `NameStyleConverter`
// (third_party/blink/renderer/build/scripts/blinkbuild/name_style_converter.py).
// That coupling is encoded by the `:blink_snake` modifier and its
// companion `blink_special_tokens` list in the TOML's `[global]` section,
// not by a generic `:snake` — because there is no engine-neutral snake
// convention this translation could appeal to. WebKit and Mozilla bindings
// keep PascalCase in their generated symbols, so they don't need an
// equivalent. If a future engine needs its own convention, add a new
// modifier (e.g. `:webkit_snake`) rather than overloading this one.
// ---------------------------------------------------------------------------

import { parse as parseToml } from 'smol-toml';

/**
 * A template-driven label produced by auto-discovery. `label` is the name
 * template (e.g. "set {Class}.{prop}"), `patterns` are the per-engine
 * funcPrefix templates whose vars are recovered from observed func names.
 */
export type AutoLabel = {
  label: string;
  patterns: string[];
};

export type LabelConfig = {
  name: string;
  funcPrefixes?: string[];
};

export type LabelDescription = {
  name: string;
  funcPrefixes: string[];
};

export type ParsedLabelToml = {
  labels: LabelConfig[];
  autoLabels: AutoLabel[];
  blinkSpecialTokens: string[];
};

// ---------------------------------------------------------------------------
// Blink-style tokenization
// ---------------------------------------------------------------------------

const BLINK_TOKEN_PATTERNS = [
  '[A-Z]?[a-z]+',
  '[A-Z]+(?![a-z])',
  '[0-9][Dd](?![a-z])',
  '[0-9]+',
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildBlinkTokenRegex(blinkSpecialTokens: string[]): RegExp {
  // Sort by length desc so longer entries that share a prefix with shorter
  // ones (e.g. `WebGL2` vs `WebGL`) match first. JS regex alternation picks
  // the leftmost successful alternative, not the longest match.
  const sorted = [...blinkSpecialTokens].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(escapeRegex);
  return new RegExp([...escaped, ...BLINK_TOKEN_PATTERNS].join('|'), 'g');
}

function buildBlinkLeadingNumberTokenRegex(
  blinkSpecialTokens: string[]
): RegExp | null {
  const withNumbers = blinkSpecialTokens.filter((t) => /[0-9]/.test(t));
  if (withNumbers.length === 0) {
    return null;
  }
  const sorted = [...withNumbers].sort((a, b) => b.length - a.length);
  return new RegExp('^(' + sorted.map(escapeRegex).join('|') + ')', 'i');
}

/**
 * Tokenize a name following Blink's NameStyleConverter. Special tokens
 * (e.g. `HTML`, `WebGL2`, `XPath`, `2D`) are matched first as single units;
 * otherwise the default patterns capture camelCase boundaries and runs of
 * capitals.
 */
export function tokenizeBlinkName(
  name: string,
  blinkSpecialTokens: string[]
): string[] {
  const tokens: string[] = [];
  let remaining = name;

  // Case-insensitive leading match for digit-bearing special tokens. Lets us
  // tokenize lowerCamelCase like `webgl2RenderingContext` (where the leading
  // special token has been lowercased).
  const leadingRe = buildBlinkLeadingNumberTokenRegex(blinkSpecialTokens);
  if (leadingRe !== null) {
    const m = remaining.match(leadingRe);
    if (m !== null) {
      tokens.push(m[1]);
      remaining = remaining.slice(m[1].length);
    }
  }

  const tokenRe = buildBlinkTokenRegex(blinkSpecialTokens);
  for (const m of remaining.matchAll(tokenRe)) {
    tokens.push(m[0]);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Forward modifiers
// ---------------------------------------------------------------------------

export function applyModifier(
  value: string,
  modifier: string | undefined,
  blinkSpecialTokens: string[] = []
): string {
  switch (modifier) {
    case 'pascal':
      return value.charAt(0).toUpperCase() + value.slice(1);
    case 'blink_snake':
      return tokenizeBlinkName(value, blinkSpecialTokens)
        .map((t) => t.toLowerCase())
        .join('_');
    case undefined:
      return value;
    default:
      throw new Error(`Unknown template modifier: ${modifier}`);
  }
}

export function expandPattern(
  pattern: string,
  vars: Record<string, string>,
  blinkSpecialTokens: string[] = []
): string {
  return pattern.replace(
    /\{(\w+)(?::(\w+))?\}/g,
    (_match, name: string, modifier: string | undefined) => {
      if (!(name in vars)) {
        throw new Error(`Template variable "${name}" not provided`);
      }
      return applyModifier(vars[name], modifier, blinkSpecialTokens);
    }
  );
}

// ---------------------------------------------------------------------------
// Reverse modifiers
// ---------------------------------------------------------------------------

function capitalizeFirstAlpha(seg: string): string {
  const idx = seg.search(/[A-Za-z]/);
  if (idx < 0) {
    return seg;
  }
  return seg.slice(0, idx) + seg.charAt(idx).toUpperCase() + seg.slice(idx + 1);
}

/**
 * Reverse a `:blink_snake`-formed string back to its PascalCase original.
 *
 * Lowercasing during `:blink_snake` is one-way: `html_element` could come
 * from either `HtmlElement` or `HTMLElement`. The caller supplies
 * `blinkSpecialTokens` — canonical-cased fragments expected in the
 * original — to disambiguate.
 *
 * Blink's `to_upper_camel_case` only consults SPECIAL_TOKENS for the first
 * token, relying on tokenization to preserve the casing of subsequent
 * tokens. We extend that to every position because by the time a name has
 * been emitted as snake_case in a V8 binding func name, the tokenization is
 * already gone.
 */
export function reverseBlinkSnake(
  value: string,
  blinkSpecialTokens: string[] = []
): string {
  const tokenByLower = new Map<string, string>();
  for (const t of blinkSpecialTokens) {
    tokenByLower.set(t.toLowerCase(), t);
  }
  return value
    .split('_')
    .map((seg) => tokenByLower.get(seg) ?? capitalizeFirstAlpha(seg))
    .join('');
}

export function reverseModifier(
  value: string,
  modifier: string | undefined,
  blinkSpecialTokens: string[] = []
): string {
  switch (modifier) {
    case 'pascal':
      return value.charAt(0).toLowerCase() + value.slice(1);
    case 'blink_snake':
      return reverseBlinkSnake(value, blinkSpecialTokens);
    case undefined:
      return value;
    default:
      throw new Error(`Unknown template modifier: ${modifier}`);
  }
}

// ---------------------------------------------------------------------------
// Pattern → regex compilation (used for auto-discovery)
// ---------------------------------------------------------------------------

const VAR_PATTERN_RE = /\{(\w+)(?::(\w+))?\}/g;

function regexCharClassForVar(
  name: string,
  modifier: string | undefined
): string {
  if (modifier === 'blink_snake') {
    // snake_case identifier: starts with lowercase letter or digit, may
    // contain `_`-separated alnum runs.
    return '[a-z][a-z0-9]*(?:_[a-z0-9]+)*';
  }
  // No modifier or :pascal — matches the case-style expected at the
  // expansion site. PascalCase if the var name starts with uppercase,
  // camelCase otherwise. `:pascal` always emits a PascalCase result.
  // Underscores are excluded from camelCase: DOM method/property names
  // are camelCase, and allowing `_` would let `{method}` swallow the
  // `set_`/`get_` prefix of binding setters/getters (matching
  // `mozilla::dom::Element_Binding::set_innerHTML(` as method=
  // `set_innerHTML` instead of leaving it for the dom_setter template).
  if (modifier === 'pascal' || /^[A-Z]/.test(name)) {
    return '[A-Z][A-Za-z0-9]*';
  }
  return '[a-z][A-Za-z0-9]*';
}

export function compilePatternToRegex(pattern: string): {
  regex: RegExp;
  vars: Array<{ name: string; modifier: string | undefined }>;
} {
  const vars: Array<{ name: string; modifier: string | undefined }> = [];
  let regexStr = '';
  let lastIndex = 0;
  for (const m of pattern.matchAll(VAR_PATTERN_RE)) {
    regexStr += escapeRegex(pattern.slice(lastIndex, m.index));
    const name = m[1];
    const modifier = m[2] ?? undefined;
    regexStr += '(' + regexCharClassForVar(name, modifier) + ')';
    vars.push({ name, modifier });
    lastIndex = m.index! + m[0].length;
  }
  regexStr += escapeRegex(pattern.slice(lastIndex));
  return { regex: new RegExp('^' + regexStr), vars };
}

// ---------------------------------------------------------------------------
// Auto-discovery
// ---------------------------------------------------------------------------

type CompiledAutoEntry = {
  auto: AutoLabel;
  patterns: Array<{
    pattern: string;
    regex: RegExp;
    vars: Array<{ name: string; modifier: string | undefined }>;
  }>;
};

function compileAutoLabels(parsed: ParsedLabelToml): CompiledAutoEntry[] {
  return parsed.autoLabels.map((auto) => {
    const patterns = auto.patterns.map((pattern) => {
      const { regex, vars } = compilePatternToRegex(pattern);
      return { pattern, regex, vars };
    });
    return { auto, patterns };
  });
}

/**
 * Walk `funcNames` and synthesize a label entry for each unique
 * (auto-label, recovered-vars) tuple matched by an `[[auto_labels]]` entry.
 * Each entry's funcPrefixes is the forward-expansion of every pattern in
 * the entry, so the label still matches across engines even if only
 * one engine's funcs were observed.
 */
export function discoverAutoLabels(
  parsed: ParsedLabelToml,
  funcNames: Iterable<string>
): LabelDescription[] {
  const compiled = compileAutoLabels(parsed);
  if (compiled.length === 0) {
    return [];
  }

  type Discovered = {
    auto: AutoLabel;
    vars: Record<string, string>;
    labelName: string;
  };
  const discovered = new Map<string, Discovered>();

  for (const funcName of funcNames) {
    for (const { auto, patterns } of compiled) {
      for (const c of patterns) {
        const m = funcName.match(c.regex);
        if (!m) {
          continue;
        }

        const vars: Record<string, string> = {};
        let recoverFailed = false;
        for (let i = 0; i < c.vars.length; i++) {
          const { name, modifier } = c.vars[i];
          try {
            vars[name] = reverseModifier(
              m[i + 1],
              modifier,
              parsed.blinkSpecialTokens
            );
          } catch {
            recoverFailed = true;
            break;
          }
        }
        if (recoverFailed) {
          continue;
        }

        // Round-trip verification: forward-expand the same pattern with the
        // recovered vars and confirm it's a prefix of the observed func name.
        // Filters out cases where the reverse modifier produced something the
        // forward modifier doesn't agree with (e.g. special-token mismatch).
        let roundTrip: string;
        try {
          roundTrip = expandPattern(c.pattern, vars, parsed.blinkSpecialTokens);
        } catch {
          continue;
        }
        if (!funcName.startsWith(roundTrip)) {
          continue;
        }

        let labelName: string;
        try {
          labelName = expandPattern(
            auto.label,
            vars,
            parsed.blinkSpecialTokens
          );
        } catch {
          continue;
        }

        const key = auto.label + '\0' + labelName;
        if (!discovered.has(key)) {
          discovered.set(key, { auto, vars, labelName });
        }
        break; // first matching pattern wins for this (auto, funcName)
      }
    }
  }

  const result: LabelDescription[] = [];
  for (const d of discovered.values()) {
    const funcPrefixes = d.auto.patterns.map((p) =>
      expandPattern(p, d.vars, parsed.blinkSpecialTokens)
    );
    result.push({ name: d.labelName, funcPrefixes });
  }
  return result;
}

// ---------------------------------------------------------------------------
// TOML entry points
// ---------------------------------------------------------------------------

export function parseLabelToml(tomlText: string): ParsedLabelToml {
  const data = parseToml(tomlText) as unknown as {
    global?: { blink_special_tokens?: string[] };
    labels?: LabelConfig[];
    auto_labels?: AutoLabel[];
  };
  return {
    labels: data.labels ?? [],
    autoLabels: data.auto_labels ?? [],
    blinkSpecialTokens: data.global?.blink_special_tokens ?? [],
  };
}

/**
 * Resolve `[[auto_labels]]` against `funcNames`, then merge in `[[labels]]`.
 * On a name collision between an auto-discovered label and an explicit one,
 * funcPrefixes are concatenated (auto first, explicit second) — explicit
 * labels can extend an auto-discovered label with extra prefixes the
 * template can't synthesize.
 */
export function resolveAllLabels(
  parsed: ParsedLabelToml,
  funcNames: Iterable<string>
): LabelDescription[] {
  const auto = discoverAutoLabels(parsed, funcNames);

  const byName = new Map<string, LabelDescription>();
  for (const l of auto) {
    byName.set(l.name, l);
  }
  for (const l of parsed.labels) {
    const extras = l.funcPrefixes ?? [];
    const existing = byName.get(l.name);
    if (existing) {
      byName.set(l.name, {
        name: l.name,
        funcPrefixes: [...existing.funcPrefixes, ...extras],
      });
    } else {
      byName.set(l.name, { name: l.name, funcPrefixes: extras });
    }
  }
  return [...byName.values()];
}
