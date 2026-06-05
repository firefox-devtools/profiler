/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Scope tree construction from compiled JavaScript using Lezer.
 *
 * ## Why we need this
 *
 * Source maps don't expose function scopes. They're a flat list of
 * generated -> original token mappings, some of which carry a `name`.
 * There's no "this range belongs to function F" information, and for many
 * functions there's no usable name at any single token to begin with:
 *
 *   - For anonymous functions (`() => {}`, `function() {}`), there is no
 *     identifier in either source for the mapping to attach a name to.
 *   - For functions inferred from context (`var x = () => {}`,
 *     `obj.foo = function() {}`, `obj[key] = fn`), the name has to be
 *     recovered from surrounding AST nodes, not from the function token.
 *   - Even for self-named functions, the sample's position lands somewhere
 *     in the body, not on the identifier, so we still need to know where
 *     the identifier sits in order to probe the source map for it.
 *
 * So we reconstruct that information by parsing the compiled JS
 * ourselves. The shapes we recognize and the fields we record for each
 * are catalogued below, and the resolver in source-map-symbolication.ts
 * consumes them.
 *
 * The TC39 source-map scopes proposal (ecma426, stage 3) would encode
 * this scope information directly in the source map and let us skip the
 * CST reconstruction entirely. Once it ships and toolchains start emitting
 * it, this file can become a fallback for source maps that lack a scopes
 * section. See https://github.com/tc39/ecma426/blob/main/proposals/scopes.md.
 *
 * ## What this file produces
 *
 * Parses the compiled source with @lezer/javascript, walks the resulting
 * concrete syntax tree (CST), and builds a tree of function scopes. A CST
 * is a syntax tree that preserves every token from the source, including
 * punctuation, parentheses, and whitespace positions, unlike an abstract
 * syntax tree (AST), which typically drops them. We need the CST because
 * the whole point of this pass is to compute character offsets in the
 * compiled source (for source-map probes), so the exact positions of
 * tokens like the opening `(` or the `=>` arrow matter.
 *
 * Each scope carries `nameMappingLocations` (character offsets to probe
 * via exact source-map lookups) plus, for inferred scopes, extra fields
 * the resolver in source-map-symbolication.ts uses to recover the
 * original name.
 *
 * ## Shapes recognized
 *
 * Self-named (the function/method has its own identifier):
 *
 *   function foo() {}                  // astName = "foo"
 *   const x = function bar() {}        // bar's astName = "bar"
 *   class C { foo() {} }               // astName = "foo"
 *   { foo: () => {} }                  // astName = "foo"
 *
 * Inferred from a direct assignment target:
 *
 *   var x = () => {}                   // probe at `x`, lhsText = "x"
 *   obj.foo = function() {}            // probe at `foo`, lhsText = "obj.foo"
 *
 * Inferred through a transparent wrapper (sets `contributesTo`, which the
 * resolver maps to the Nonymous `<` suffix):
 *
 *   var observer = new IntersectionObserver(() => {})  // contributesTo = true
 *   var x = wrap(() => {})                             // contributesTo = true
 *
 * Computed-member LHS (sets `computedKeyLoc` so the resolver can compose
 * `${receiver}[${key}]` from two independent probes):
 *
 *   obj[key] = function() {}
 *     // identifierLoc at `obj`, computedKeyLoc at `key`, lhsText = "obj[key]"
 *
 * Every inferred scope also records `lhsText`, the verbatim source slice of
 * the assignment-target LHS. The resolver feeds it through the original
 * parse of the source (from `sourcesContent`), so the un-minified member
 * chain survives even when the minifier rewrote the LHS.
 */

import { parser as lezerJsParser } from '@lezer/javascript';

import { bisectionRightByKey } from '../utils/bisect';

// Derive SyntaxNode from the parser to avoid version conflicts with nested
// @lezer/common copies in node_modules (they have incompatible private fields).
type SyntaxNode = ReturnType<typeof lezerJsParser.parse>['topNode'];

export type FunctionScope = {
  // Character offsets in the compiled source, inclusive start / exclusive end.
  start: number;
  end: number;
  // Ordered list of character offsets to probe with an exact source-map lookup.
  // The first probe that yields a named entry wins.
  nameMappingLocations: number[];
  // Fallback name derived from the AST (the compiled identifier, e.g. `foo`).
  // null for anonymous functions and arrow functions.
  astName: string | null;
  kind: 'function' | 'arrow';
  // True when the function's inferred name came through a wrapping
  // `call(...)` / `new C(...)`, i.e. the function "contributes to" the
  // assignment target rather than being it. Emits the Nonymous `<` suffix
  // (e.g. `outer/observer<` for `var observer = new C(() => {})`).
  contributesTo: boolean;
  // Set for scopes inferred from a computed-member assignment `obj[key] = fn`:
  // the char offset of the bracket-key expression. Used to compose a compound
  // `receiver[key]` name from two independent source-map probes, matching
  // SpiderMonkey's output where the function's name is the literal source
  // text of the LHS (e.g. `obj[key]`). Only consulted as a fallback when the
  // original source isn't available in `sourcesContent`. Otherwise `lhsText`
  // wins.
  computedKeyLoc: number | null;
  // Verbatim source text of the assignment-target LHS for inferred scopes.
  // For a scope built from this scope-tree's source, that's just the slice
  // of `text` between the LHS node's `from`/`to`. The resolver uses it via
  // the *original* parse of the source (read from the source map's
  // `sourcesContent`), so the name is whatever the developer wrote
  // (`Watcher.prototype.run`, `this.eventPool_.createObject`, `obj[key]`,
  // etc.), independent of how the minifier rewrote the LHS.
  lhsText: string | null;
  children: FunctionScope[];
};

// ---------------------------------------------------------------------------
// Mapping-location helpers
// ---------------------------------------------------------------------------

function _mappingLocationsForFunction(
  node: SyntaxNode,
  text: string
): number[] {
  const locations: number[] = [];
  const nameNode = node.getChild('VariableDefinition');
  if (nameNode) {
    locations.push(nameNode.from);
  }
  const paramList = node.getChild('ParamList');
  if (paramList && text[paramList.from] === '(') {
    locations.push(paramList.from);
  }
  return locations;
}

function _mappingLocationsForArrow(node: SyntaxNode, text: string): number[] {
  const locations: number[] = [];

  const paramList = node.getChild('ParamList');
  if (paramList && text[paramList.from] === '(') {
    locations.push(paramList.from);
  }

  const arrow = node.getChild('Arrow');
  if (arrow) {
    locations.push(arrow.from);
  }

  return locations;
}

function _keyMappingLocation(node: SyntaxNode): number[] {
  const key =
    node.getChild('PropertyDefinition') ??
    node.getChild('PrivatePropertyDefinition');
  return key ? [key.from] : [];
}

function _astNameForKey(node: SyntaxNode, text: string): string | null {
  const key =
    node.getChild('PropertyDefinition') ??
    node.getChild('PrivatePropertyDefinition');
  if (!key) {
    return null;
  }
  // PrivatePropertyDefinition spans `#name` including the `#`.
  return text.slice(key.from, key.to);
}

/**
 * Describes the assignment target of an AssignmentExpression / VariableDeclarator
 * for the purpose of inferring a function name from it.
 *
 * `identifierLoc` is the char offset of an identifier to probe in the source
 * map for the original name (the variable, property name, or, for computed
 * member access, the receiver expression).
 *
 * `computedKeyLoc` is set for `obj[key] = fn`: the offset of the bracket-key
 * expression. The resolver probes it separately and composes
 * `${receiver}[${key}]` so the assigned-to expression survives symbolication.
 *
 * `lhsText` is the verbatim source slice of the LHS (e.g. `Foo.prototype.bar`,
 * `obj[key]`, `foo`). The resolver prefers it when looking up the function in
 * the original source.
 */
type LhsContext = {
  identifierLoc: number;
  computedKeyLoc: number | null;
  lhsText: string | null;
};

function _lhsContextFromAssignment(
  node: SyntaxNode,
  text: string
): LhsContext | null {
  const lhs = node.firstChild;
  if (!lhs) {
    return null;
  }
  const lhsText = text.slice(lhs.from, lhs.to);
  if (lhs.name === 'VariableName') {
    return { identifierLoc: lhs.from, computedKeyLoc: null, lhsText };
  }
  if (lhs.name === 'MemberExpression') {
    const prop = lhs.getChild('PropertyName');
    if (prop) {
      return { identifierLoc: prop.from, computedKeyLoc: null, lhsText };
    }
    // Computed access `receiver[key]`. The receiver's leading identifier is
    // used for the main probe, and the key expression for the compound-name
    // probe (so we can compose `${receiver}[${key}]` from two probes).
    const keyLoc = _computedMemberKeyLoc(lhs);
    if (keyLoc !== null) {
      return { identifierLoc: lhs.from, computedKeyLoc: keyLoc, lhsText };
    }
  }
  return null;
}

/**
 * For a MemberExpression with computed access (`receiver[keyExpr]`),
 * return the char offset of the key expression. Returns null for dotted
 * accesses or unexpected shapes.
 */
function _computedMemberKeyLoc(memberExpr: SyntaxNode): number | null {
  let pastBracket = false;
  for (let c = memberExpr.firstChild; c; c = c.nextSibling) {
    if (c.name === '[') {
      pastBracket = true;
      continue;
    }
    if (c.name === ']') {
      return null;
    }
    if (pastBracket) {
      return c.from;
    }
  }
  return null;
}

/**
 * Create a FunctionScope for an anonymous (or arrow) function node whose name
 * must be inferred from surrounding AST context (VariableDeclarator, assignment
 * target, wrap-pattern call argument).
 *
 * `lhs.identifierLoc` is appended LAST to `nameMappingLocations` so the source
 * map is queried for the original identifier name only after all of the
 * function's own probes have failed. Using it last prevents a broad mapping at
 * the identifier from overriding a more precise name found at the function's
 * paren/arrow position.
 *
 * `contributesTo` reflects whether the inference passed through a wrapping
 * call/`new` (i.e. the function contributes to the target rather than being
 * it). It maps directly to the Nonymous `<` suffix.
 *
 * `astName` is intentionally left null. If the identifier probe also fails we
 * have no meaningful fallback name. The compiled variable name is a minified
 * identifier and using it would produce incorrect names in the profiler. In
 * that case the function keeps its Gecko-assigned name unchanged.
 */
function _pushInferredScope(
  funcNode: SyntaxNode,
  text: string,
  parentChildren: FunctionScope[],
  lhs: LhsContext,
  contributesTo: boolean
): void {
  const funcLocations =
    funcNode.name === 'ArrowFunction'
      ? _mappingLocationsForArrow(funcNode, text)
      : _mappingLocationsForFunction(funcNode, text);
  const scope: FunctionScope = {
    start: funcNode.from,
    end: funcNode.to,
    nameMappingLocations: [...funcLocations, lhs.identifierLoc],
    astName: null,
    kind: funcNode.name === 'ArrowFunction' ? 'arrow' : 'function',
    contributesTo,
    computedKeyLoc: lhs.computedKeyLoc,
    lhsText: lhs.lhsText,
    children: [],
  };
  parentChildren.push(scope);
  _walkChildren(funcNode, text, scope.children);
}

/**
 * Process the RHS of an assignment-like construct (a VariableDeclarator's
 * init or an AssignmentExpression's RHS), inferring `identifierLoc` for any
 * anonymous function / arrow argument reached through "transparent" wrapping
 * expressions.
 *
 * In the examples below, `() => {}` stands in for any anonymous function or
 * arrow function.
 *
 * Recognised wrappers:
 *   - ParenthesizedExpression - `(() => {})`
 *   - CallExpression          - `wrap(() => {})` / `wrap(f1, f2)`
 *   - NewExpression           - `new Class(() => {})`
 *
 * `throughWrapper` tracks whether the traversal has descended through a
 * Call/New: that's what distinguishes "fn IS the target" (`var x = () => {}`,
 * `obj.foo = () => {}`, `obj[key] = () => {}`) from "fn CONTRIBUTES TO the
 * target" (`var x = wrap(() => {})`, `var x = new C(() => {})`). It maps
 * directly to the Nonymous `<` suffix on the resulting scope.
 *
 * Other nested function literals (e.g. inside the wrapper's body or in
 * non-argument positions) are processed normally with no inference.
 */
function _processInitExpr(
  initNode: SyntaxNode,
  text: string,
  parentChildren: FunctionScope[],
  lhs: LhsContext,
  throughWrapper: boolean
): void {
  switch (initNode.name) {
    case 'ArrowFunction':
      _pushInferredScope(initNode, text, parentChildren, lhs, throughWrapper);
      return;
    case 'FunctionExpression': {
      // Only infer a name for truly anonymous functions. Named function
      // expressions (`const foo = function bar() {}`) keep their `bar` name.
      const isAnon = initNode.getChild('VariableDefinition') === null;
      if (isAnon) {
        _pushInferredScope(initNode, text, parentChildren, lhs, throughWrapper);
      } else {
        _processNode(initNode, text, parentChildren);
      }
      return;
    }
    case 'ParenthesizedExpression': {
      // Parens are pure-syntactic. Preserve throughWrapper as-is.
      for (let c = initNode.firstChild; c; c = c.nextSibling) {
        if (c.name === '(' || c.name === ')') {
          continue;
        }
        _processInitExpr(c, text, parentChildren, lhs, throughWrapper);
      }
      return;
    }
    case 'CallExpression':
    case 'NewExpression': {
      // For each child of the call: if it's the argument list, recurse into
      // each argument with inference. Other children (callee, type args) are
      // walked normally so any nested function literals there get plain
      // scopes. They don't "contribute to" the assignment target.
      // Optional calls (`fn?.(() => {})`) are also CallExpression in @lezer/javascript
      // (the optional `?.` is an inner token), so they go through this branch.
      for (let c = initNode.firstChild; c; c = c.nextSibling) {
        if (c.name === 'ArgList') {
          for (let arg = c.firstChild; arg; arg = arg.nextSibling) {
            if (arg.name === '(' || arg.name === ')' || arg.name === ',') {
              continue;
            }
            _processInitExpr(arg, text, parentChildren, lhs, true);
          }
        } else {
          _processNode(c, text, parentChildren);
        }
      }
      return;
    }
    case 'AwaitExpression': {
      // `await wrap(() => {})` keeps wrap-pattern inference for the inner call.
      // The `await` keyword is itself a child; skip it.
      for (let c = initNode.firstChild; c; c = c.nextSibling) {
        if (c.name === 'await') {
          continue;
        }
        _processInitExpr(c, text, parentChildren, lhs, throughWrapper);
      }
      return;
    }
    case 'TaggedTemplateExpression': {
      // `` tag`${() => {}}` `` behaves like `tag(["..."], () => {})`: interpolated
      // expressions contribute to the assignment target via the tag call.
      for (let c = initNode.firstChild; c; c = c.nextSibling) {
        if (c.name !== 'TemplateString') {
          // The tag (callee). Walk normally so any nested function literal
          // inside it gets a plain scope rather than being inferred.
          _processNode(c, text, parentChildren);
          continue;
        }
        for (let part = c.firstChild; part; part = part.nextSibling) {
          if (part.name !== 'Interpolation') {
            continue;
          }
          for (let e = part.firstChild; e; e = e.nextSibling) {
            if (
              e.name === 'InterpolationStart' ||
              e.name === 'InterpolationEnd'
            ) {
              continue;
            }
            _processInitExpr(e, text, parentChildren, lhs, true);
          }
        }
      }
      return;
    }
    default:
      _processNode(initNode, text, parentChildren);
  }
}

// ---------------------------------------------------------------------------
// CST walker
// ---------------------------------------------------------------------------

function _processNode(
  node: SyntaxNode,
  text: string,
  parentChildren: FunctionScope[]
): void {
  switch (node.name) {
    case 'MethodDeclaration': {
      const keyNode =
        node.getChild('PropertyDefinition') ??
        node.getChild('PrivatePropertyDefinition');
      if (!keyNode) {
        // Computed key. No stable mapping location.
        _walkChildren(node, text, parentChildren);
        return;
      }
      _pushMethodScope(node, text, parentChildren);
      return;
    }
    case 'Property': {
      const keyNode =
        node.getChild('PropertyDefinition') ??
        node.getChild('PrivatePropertyDefinition');

      if (!keyNode) {
        // Computed key (`{ [expr]() {} }`): no stable mapping location.
        _walkChildren(node, text, parentChildren);
        return;
      }

      const hasColon = node.getChild(':') !== null;

      if (!hasColon) {
        const hasParamList = node.getChild('ParamList') !== null;
        if (!hasParamList) {
          // Shorthand `{ a }`: not a function definition.
          return;
        }
        // Method shorthand: `{ foo() {} }`.
        _pushMethodScope(node, text, parentChildren);
        return;
      }

      // Function-valued property: `{ foo: function() {} }` or `{ foo: () => {} }`.
      const funcNode =
        node.getChild('FunctionExpression') ?? node.getChild('ArrowFunction');
      if (funcNode) {
        _pushMethodScope(node, text, parentChildren);
        return;
      }

      // Non-function value: walk in case there are nested functions.
      _walkChildren(node, text, parentChildren);
      return;
    }
    case 'VariableDeclaration': {
      // Lezer flattens multi-declaration: keyword, VarDef, Equals, init, ',', VarDef, Equals, init, ...
      // Pair each VariableDefinition with its init expression (the child that
      // follows the matching Equals). The init is dispatched to
      // _processInitExpr so wrapping calls/new contribute inferred names to
      // function arguments.
      let pendingId: SyntaxNode | null = null;
      let sawEquals = false;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'VariableDefinition') {
          pendingId = child;
          sawEquals = false;
        } else if (child.name === 'Equals') {
          sawEquals = true;
        } else if (child.name === ',') {
          pendingId = null;
          sawEquals = false;
        } else if (sawEquals && pendingId !== null) {
          _processInitExpr(
            child,
            text,
            parentChildren,
            {
              identifierLoc: pendingId.from,
              computedKeyLoc: null,
              lhsText: text.slice(pendingId.from, pendingId.to),
            },
            /* throughWrapper */ false
          );
          pendingId = null;
          sawEquals = false;
        } else {
          // Standalone child (var/let/const keyword, TypeAnnotation, ...):
          // walk it for nested functions but don't treat it as an init.
          _processNode(child, text, parentChildren);
        }
      }
      return;
    }
    case 'AssignmentExpression': {
      const lhs = _lhsContextFromAssignment(node, text);
      // Only infer for plain `=`. Compound assignments (`+=`, `||=`, ...) have
      // an UpdateOp instead of an Equals child. Let those fall through to the
      // default walk, since the LHS isn't really being assigned a new identity.
      if (lhs === null || node.getChild('Equals') === null) {
        _walkChildren(node, text, parentChildren);
        return;
      }
      let pastEquals = false;
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.name === 'Equals') {
          pastEquals = true;
          continue;
        }
        if (pastEquals) {
          _processInitExpr(c, text, parentChildren, lhs, false);
        } else {
          // LHS. Walk for nested functions inside computed properties etc.
          _processNode(c, text, parentChildren);
        }
      }
      return;
    }
    case 'FunctionDeclaration':
    case 'FunctionExpression': {
      const nameNode = node.getChild('VariableDefinition');
      const scope: FunctionScope = {
        start: node.from,
        end: node.to,
        nameMappingLocations: _mappingLocationsForFunction(node, text),
        astName: nameNode ? text.slice(nameNode.from, nameNode.to) : null,
        kind: 'function',
        contributesTo: false,
        computedKeyLoc: null,
        lhsText: null,
        children: [],
      };
      parentChildren.push(scope);
      _walkChildren(node, text, scope.children);
      return;
    }
    case 'ArrowFunction': {
      const scope: FunctionScope = {
        start: node.from,
        end: node.to,
        nameMappingLocations: _mappingLocationsForArrow(node, text),
        astName: null,
        kind: 'arrow',
        contributesTo: false,
        computedKeyLoc: null,
        lhsText: null,
        children: [],
      };
      parentChildren.push(scope);
      _walkChildren(node, text, scope.children);
      return;
    }
    default:
      _walkChildren(node, text, parentChildren);
  }
}

/**
 * Create and push a FunctionScope for a MethodDeclaration or a Property with a
 * function value.
 *
 * The scope starts at `node.from` (the method key) so that the function's
 * generated position (which Gecko reports at the key) is covered.
 *
 * For MethodDeclaration (and method-shorthand Property), ParamList/Block are
 * direct children of the node. For Property with a function value, funcChild
 * is the FunctionExpression/ArrowFunction wrapper. Either way, we walk
 * children of funcNode to avoid re-creating a scope for the wrapper itself.
 */
function _pushMethodScope(
  node: SyntaxNode,
  text: string,
  parentChildren: FunctionScope[]
): void {
  const funcChild =
    node.getChild('FunctionExpression') ?? node.getChild('ArrowFunction');
  const funcNode = funcChild ?? node;

  const funcLocations =
    funcNode.name === 'ArrowFunction'
      ? _mappingLocationsForArrow(funcNode, text)
      : _mappingLocationsForFunction(funcNode, text);

  const scope: FunctionScope = {
    start: node.from,
    end: node.to,
    nameMappingLocations: [..._keyMappingLocation(node), ...funcLocations],
    astName: _astNameForKey(node, text),
    // Arrow-valued properties (e.g. `{ foo: () => {} }`) must be 'arrow' so
    // source-map symbolication skips the funcOffset probe, which resolves to
    // the first parameter name rather than the function name.
    kind: funcChild?.name === 'ArrowFunction' ? 'arrow' : 'function',
    contributesTo: false,
    computedKeyLoc: null,
    lhsText: null,
    children: [],
  };
  parentChildren.push(scope);
  _walkChildren(funcNode, text, scope.children);
}

function _walkChildren(
  node: SyntaxNode,
  text: string,
  children: FunctionScope[]
): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    _processNode(child, text, children);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// @lezer/javascript ships TS and JSX as opt-in dialects. The base parser only
// understands plain JS, so a `.ts` or `.tsx` source feeding back through
// `sourcesContent` produces Error nodes for every type annotation or JSX
// element. Always configure the matching dialect for original sources.
export type JsDialect = '' | 'ts' | 'jsx' | 'ts jsx';

const _configuredParsers = new Map<JsDialect, typeof lezerJsParser>();

function _parserForDialect(dialect: JsDialect): typeof lezerJsParser {
  if (!dialect) {
    return lezerJsParser;
  }
  let parser = _configuredParsers.get(dialect);
  if (parser === undefined) {
    parser = lezerJsParser.configure({ dialect });
    _configuredParsers.set(dialect, parser);
  }
  return parser;
}

/**
 * Map a source filename to the Lezer dialect needed to parse it. Looks at the
 * file extension only. Accepts URL-style source paths (the typical content of
 * a source map's `sources[]`).
 */
export function dialectForFilename(filename: string): JsDialect {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tsx')) {
    return 'ts jsx';
  }
  if (lower.endsWith('.jsx')) {
    return 'jsx';
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts')
  ) {
    return 'ts';
  }
  return '';
}

/**
 * Parse `sourceText` with Lezer and return the top-level function scopes.
 *
 * `dialect` selects the Lezer dialect: `'ts'` for TypeScript, `'jsx'` for
 * JSX, `'ts jsx'` for TSX. Default `''` is plain JS.
 *
 * Lezer never throws on invalid JS. Error nodes are silently skipped.
 */
export function parseJsScopeTree(
  sourceText: string,
  dialect: JsDialect = ''
): FunctionScope[] {
  const tree = _parserForDialect(dialect).parse(sourceText);
  const topLevel: FunctionScope[] = [];
  _walkChildren(tree.topNode, sourceText, topLevel);
  return topLevel;
}

/**
 * Find the innermost FunctionScope in the tree that contains `offset`.
 *
 * Returns the path from innermost to outermost as an array:
 *   result[0]:       the innermost scope (the one that directly contains offset)
 *   result.slice(1): ancestors, nearest first (parent, grandparent, ...)
 *
 * Returns null if no top-level scope contains the offset. Sibling scopes are
 * pushed in source order and are non-overlapping, so a binary search picks the
 * candidate at each level in O(log n).
 */
export function findInnermostFunctionScope(
  scopes: FunctionScope[],
  offset: number
): FunctionScope[] | null {
  function search(siblings: FunctionScope[]): FunctionScope[] | null {
    const idx = bisectionRightByKey(siblings, offset, (s) => s.start) - 1;
    if (idx < 0) {
      return null;
    }
    const candidate = siblings[idx];
    if (offset >= candidate.end) {
      return null;
    }
    const found = search(candidate.children);
    if (found !== null) {
      found.push(candidate);
      return found;
    }
    return [candidate];
  }

  return search(scopes);
}
