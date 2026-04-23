/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// An "auto" label: a template form of `LabelDescription` whose concrete
// instantiations are synthesized by matching its `funcPrefixTemplates`
// against function names in the profile. E.g. matching
// "mozilla::dom::{Class}_Binding::{method}(" against
// "mozilla::dom::EventTarget_Binding::addEventListener(JSContext*, ...)" will create
// an instantiation with Class="EventTarget" and method="addEventListener".
// `nameTemplate` and `funcPrefixTemplates` mirror the `name` and
// `funcPrefixes` of `LabelDescription`: each template expands, with the
// recovered variable values, into the corresponding literal field.
export type AutoLabel = {
  // Template for the synthesized label's `name`, e.g. "set {Class}.{prop}".
  // Only plain `{name}` placeholders are allowed here, no `{name:modifier}`.
  nameTemplate: string;
  // A list of templates, each matched independently against funcNames; a
  // successful match becomes one entry in the synthesized label's
  // `funcPrefixes`. A single AutoLabel typically lists one template per
  // engine (Gecko / Blink / WebKit) so the same logical label is
  // discovered from any of the supported binding-name styles.
  //
  // Template variables may carry a modifier, written `{name:modifier}`,
  // which controls both what the compiled regex accepts and how the
  // captured text is transformed back before substitution into
  // `nameTemplate`:
  //
  // - no modifier: matches PascalCase when the variable name starts with
  //   an uppercase letter (e.g. `{Class}` → `Element`), camelCase
  //   otherwise (e.g. `{method}` → `querySelector`). The captured text
  //   is substituted as-is.
  // - `:pascal`: matches PascalCase; the first letter is lowercased on
  //   substitution. Used to recover Blink V8 binding method names
  //   (`SetSrc` in `SetSrcOperation` → `setSrc`).
  // - `:blink_snake`: matches lowercase snake_case; on substitution the
  //   value is reassembled into PascalCase using `BLINK_SPECIAL_TOKENS`
  //   to recover acronym casing (`html_image_element` → `HTMLImageElement`).
  funcPrefixTemplates: string[];
};

// An explicit label entry, either authored directly in a labels TOML file
// (`[[labels]]`) or synthesized by `discoverAutoLabels` from an
// `[[auto_labels]]` entry. A stack frame whose funcName starts with any
// string in `funcPrefixes` gets `name` attached as its label by
// `insertStackLabels`.
export type LabelDescription = {
  name: string;
  funcPrefixes: string[];
};

// An AutoLabel with each of its `funcPrefixTemplates` compiled to a regex
// plus the ordered list of variables that regex captures (one entry per
// capture group, in match order).
type CompiledAutoEntry = {
  auto: AutoLabel;
  funcPrefixTemplates: Array<{
    regex: RegExp;
    vars: Array<{ name: string; modifier: string | undefined }>;
  }>;
};

// Allows mapping strings from auto-detected Blink DOM binding C++ functions
// to correctly-cased class names.
// For example, if we match `v8_{Class:blink_snake}` against `v8_dom_token_list`,
// we want to produce the class name "DOMTokenList" rather than "DomTokenList".
// Based on https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/build/scripts/blinkbuild/name_style_converter.py;l=10;drc=047c7dc4ee1ce908d7fea38ca063fa2f80f92c77
const BLINK_SPECIAL_TOKENS = [
  'WebCodecs',
  'WebSocket',
  'String16',
  'Float32',
  'Float64',
  'Base64',
  'IFrame',
  'Latin1',
  'MathML',
  'PlugIn',
  'SQLite',
  'Uint16',
  'Uint32',
  'WebGL2',
  'webgl2',
  'WebGPU',
  'ASCII',
  'CSSOM',
  'CType',
  'DList',
  'Int16',
  'Int32',
  'MPath',
  'OList',
  'TSpan',
  'UList',
  'UTF16',
  'Uint8',
  'WebGL',
  'XPath',
  'ETC1',
  'etc1',
  'HTML',
  'Int8',
  'S3TC',
  's3tc',
  'SPv2',
  'UTF8',
  'sRGB',
  'URLs',
  'API',
  'CSS',
  'DNS',
  'DOM',
  'EXT',
  'RTC',
  'SVG',
  'XSS',
  '2D',
  'AX',
  'FE',
  'JS',
  'V0',
  'V8',
  'v8',
  'XR',
];

// A map which allows looking up the correctly-cased token based on
// its lower cased variant, e.g. "urls" -> "URLs"
const BLINK_TOKEN_BY_LOWER = (function buildBlinkTokenByLower() {
  const tokenByLower = new Map<string, string>();
  for (const t of BLINK_SPECIAL_TOKENS) {
    const lower = t.toLowerCase();
    if (!tokenByLower.has(lower)) {
      tokenByLower.set(lower, t);
    }
  }
  return tokenByLower;
})();

/**
 * Reverse a `:blink_snake`-formed string back to its PascalCase original.
 *
 * For example, this turns "html_div_element" into "HTMLDivElement".
 *
 * Lowercasing during `:blink_snake` is one-way: `html_element` could come
 * from either `HtmlElement` or `HTMLElement`. `BLINK_SPECIAL_TOKENS`
 * supplies canonical-cased fragments to disambiguate; unknown segments
 * get their first letter capitalised.
 */
export function reverseBlinkSnake(value: string): string {
  return value
    .split('_')
    .map(
      (seg) =>
        BLINK_TOKEN_BY_LOWER.get(seg) ??
        seg.charAt(0).toUpperCase() + seg.slice(1)
    )
    .join('');
}

/**
 * Reverse the case transformation implied by `modifier` so that a value
 * captured from a funcName can be substituted back into a label template
 * in its canonical form. See the modifier list on
 * `AutoLabel.funcPrefixTemplates`.
 */
export function reverseModifier(
  value: string,
  modifier: string | undefined
): string {
  switch (modifier) {
    case 'pascal':
      return value.charAt(0).toLowerCase() + value.slice(1);
    case 'blink_snake':
      return reverseBlinkSnake(value);
    case undefined:
      return value;
    default:
      throw new Error(`Unknown template modifier: ${modifier}`);
  }
}

// This regex matches `{name}` and `{name:modifier}` placeholders.
const TEMPLATE_VAR_RE = /\{(\w+)(?::(\w+))?\}/g;

/**
 * Substitute `{name}` placeholders in a label template. Used only to
 * produce human-readable label names like `Element.querySelector`;
 * modifier syntax (`{name:modifier}`) is not supported here.
 */
export function expandPattern(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(TEMPLATE_VAR_RE, (_match, name: string, modifier) => {
    if (modifier !== undefined) {
      throw new Error(
        `Template modifier ":${modifier}" is not supported in label names`
      );
    }
    if (!(name in vars)) {
      throw new Error(`Template variable "${name}" not provided`);
    }
    return vars[name];
  });
}

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile a pattern string to a regex that matches a prefix of a funcName,
 * together with the ordered list of template variables (one per capture
 * group). Literal text in the pattern is regex-escaped; each `{name}` or
 * `{name:modifier}` placeholder is replaced by a capturing group whose
 * character class is chosen by `regexCharClassForVar`.
 *
 * E.g. "mozilla::dom::{Class}_Binding::set_{prop}(" compiles to
 * /^mozilla::dom::([A-Z][A-Za-z0-9]*)_Binding::set_([a-z][A-Za-z0-9]*)\(/
 * with vars [{ name: 'Class' }, { name: 'prop' }].
 *
 * The regex is anchored at `^` but not at `$`, so a successful match's
 * `m[0]` is the literal funcName prefix used as `funcPrefixes` entry.
 */
export function compilePatternToRegex(pattern: string): {
  regex: RegExp;
  vars: Array<{ name: string; modifier: string | undefined }>;
} {
  const vars: Array<{ name: string; modifier: string | undefined }> = [];
  let regexStr = '';
  let lastIndex = 0;
  for (const m of pattern.matchAll(TEMPLATE_VAR_RE)) {
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

function compileAutoLabel(auto: AutoLabel): CompiledAutoEntry {
  const funcPrefixTemplates = auto.funcPrefixTemplates.map((template) => {
    const { regex, vars } = compilePatternToRegex(template);
    return { regex, vars };
  });
  return { auto, funcPrefixTemplates };
}

/**
 * Walk `funcNames` and synthesize a label entry for each unique
 * (auto-label, recovered-vars) tuple matched by an `[[auto_labels]]` entry.
 * Each entry's `funcPrefixes` collects the actual matched prefix of every
 * funcName that hit one of the entry's templates, so the same label still
 * attaches to every observed form of the same (Class, method) pair.
 */
export function discoverAutoLabels(
  autoLabels: AutoLabel[],
  funcNames: Iterable<string>
): LabelDescription[] {
  const compiled = autoLabels.map((autoLabel) => compileAutoLabel(autoLabel));
  if (compiled.length === 0) {
    return [];
  }

  const discovered = new Map<string, LabelDescription>();

  for (const funcName of funcNames) {
    for (const { auto, funcPrefixTemplates } of compiled) {
      for (const c of funcPrefixTemplates) {
        const m = funcName.match(c.regex);
        if (!m) {
          continue;
        }

        const vars: Record<string, string> = {};
        for (let i = 0; i < c.vars.length; i++) {
          const { name, modifier } = c.vars[i];
          vars[name] = reverseModifier(m[i + 1], modifier);
        }

        const labelName = expandPattern(auto.nameTemplate, vars);

        const key = auto.nameTemplate + '\0' + labelName;
        const existing = discovered.get(key);
        if (existing === undefined) {
          discovered.set(key, { name: labelName, funcPrefixes: [m[0]] });
        } else if (!existing.funcPrefixes.includes(m[0])) {
          existing.funcPrefixes.push(m[0]);
        }
        break; // first matching template wins for this (auto, funcName)
      }
    }
  }

  return [...discovered.values()];
}

/**
 * Resolve `autoLabels` against `funcNames`, then merge in `labels`.
 * On a name collision (whether between two auto-discovered labels, or between
 * an auto-discovered label and an explicit one), funcPrefixes are merged into
 * a deduplicated union. Two `autoLabels` entries can legitimately produce
 * the same label name from different templates — e.g. a generic `{Class}.{method}`
 * entry and a specific `CanvasRenderingContext2D.{method}` entry both yielding
 * `CanvasRenderingContext2D.fill` — and we want every matched prefix to apply.
 */
export function resolveAllLabels(
  autoLabels: AutoLabel[],
  labels: LabelDescription[],
  funcNames: Iterable<string>
): LabelDescription[] {
  const auto = discoverAutoLabels(autoLabels, funcNames);
  const allLabels = auto.concat(labels);

  const byName = new Map<string, LabelDescription>();
  for (const { name, funcPrefixes } of allLabels) {
    let entry = byName.get(name);
    if (entry === undefined) {
      entry = { name, funcPrefixes: [] };
      byName.set(name, entry);
    }
    entry.funcPrefixes.push(...funcPrefixes);
  }
  return [...byName.values()];
}
