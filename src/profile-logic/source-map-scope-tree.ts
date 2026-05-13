/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Scope tree construction from compiled JavaScript using Lezer.
 *
 * Parse the compiled source with @lezer/javascript, walk the CST to build a
 * tree of function scopes with `nameMappingLocations` (character offsets to
 * probe in the source map for the original function name).
 */

import { parser as lezerJsParser } from '@lezer/javascript';

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
  children: FunctionScope[];
};

// ---------------------------------------------------------------------------
// Line-offset helpers
// ---------------------------------------------------------------------------

/**
 * Build a line-offset table for binary search.
 * `lineOffsets[i]` is the character offset of the start of line `i` (0-based).
 */
export function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/**
 * Convert a character offset to a 0-based { line, col } position.
 * Uses binary search over the line-offset table.
 */
export function offsetToLineCol(
  offset: number,
  lineOffsets: number[]
): { line: number; col: number } {
  let lo = 0;
  let hi = lineOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineOffsets[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { line: lo, col: offset - lineOffsets[lo] };
}

/**
 * Convert a 0-based { line, col } position back to a character offset.
 */
export function lineColToOffset(
  line: number,
  col: number,
  lineOffsets: number[]
): number {
  return lineOffsets[line] + col;
}

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
    // Parenthesised params: `(a, b) => ...`
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
 * Infer the identifier position from the left-hand side of an assignment, to
 * be used as a trailing source-map probe.
 * For `foo = fn` returns the start of `foo`.
 * For `obj.foo = fn` returns the start of the `foo` property.
 * Returns null for anything else (computed keys, destructuring, etc.).
 */
function _identifierLocFromLHS(node: SyntaxNode): number | null {
  const lhs = node.firstChild;
  if (!lhs) {
    return null;
  }
  if (lhs.name === 'VariableName') {
    return lhs.from;
  }
  if (lhs.name === 'MemberExpression') {
    const prop = lhs.getChild('PropertyName');
    return prop ? prop.from : null;
  }
  return null;
}

/**
 * Create a FunctionScope for an anonymous (or arrow) function node whose name
 * must be inferred from surrounding AST context (VariableDeclarator, assignment
 * target, etc.).
 *
 * `identifierLoc` is the char offset of the contextual identifier (e.g. the
 * variable name in `var foo = () => {}`). It is appended LAST to
 * `nameMappingLocations` so the source map is queried for the original
 * identifier name only after all of the function's own probes have failed.
 * Using it last prevents a broad mapping at the identifier from overriding a
 * more precise name found at the function's paren/arrow position.
 *
 * `astName` is intentionally left null. If the identifier probe also fails we
 * have no meaningful fallback name — the compiled variable name is a minified
 * identifier and using it would produce incorrect names in the profiler. In
 * that case the function keeps its Gecko-assigned name unchanged.
 */
function _pushInferredScope(
  funcNode: SyntaxNode,
  identifierLoc: number | null,
  text: string,
  parentChildren: FunctionScope[]
): void {
  const funcLocations =
    funcNode.name === 'ArrowFunction'
      ? _mappingLocationsForArrow(funcNode, text)
      : _mappingLocationsForFunction(funcNode, text);
  const nameMappingLocations =
    identifierLoc !== null ? [...funcLocations, identifierLoc] : funcLocations;
  const scope: FunctionScope = {
    start: funcNode.from,
    end: funcNode.to,
    nameMappingLocations,
    astName: null,
    kind: funcNode.name === 'ArrowFunction' ? 'arrow' : 'function',
    children: [],
  };
  parentChildren.push(scope);
  _walkChildren(funcNode, text, scope.children);
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
        // Computed key — no stable mapping location.
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
      // Walk children to pair each VariableDefinition with its function init.
      let pendingId: SyntaxNode | null = null;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'VariableDefinition') {
          pendingId = child;
        } else if (child.name === 'ArrowFunction') {
          if (pendingId) {
            _pushInferredScope(child, pendingId.from, text, parentChildren);
          } else {
            _processNode(child, text, parentChildren);
          }
          pendingId = null;
        } else if (child.name === 'FunctionExpression') {
          // Only infer a name for truly anonymous functions. Named function
          // expressions (`const foo = function bar() {}`) already have an id and
          // are handled by the FunctionExpression branch with astName = 'bar'.
          const isAnon = child.getChild('VariableDefinition') === null;
          if (pendingId && isAnon) {
            _pushInferredScope(child, pendingId.from, text, parentChildren);
          } else {
            _processNode(child, text, parentChildren);
          }
          pendingId = null;
        } else if (child.name !== 'Equals' && child.name !== ',') {
          // Non-function init: walk for nested functions, reset the pending id.
          _processNode(child, text, parentChildren);
          pendingId = null;
        }
      }
      return;
    }
    case 'AssignmentExpression': {
      const arrowNode = node.getChild('ArrowFunction');
      const funcNode = node.getChild('FunctionExpression');
      const isAnonFunc =
        funcNode !== null && funcNode.getChild('VariableDefinition') === null;
      const rhs = arrowNode ?? (isAnonFunc ? funcNode : null);

      if (rhs) {
        const loc = _identifierLocFromLHS(node);
        if (loc !== null) {
          _pushInferredScope(rhs, loc, text, parentChildren);
          return;
        }
      }
      _walkChildren(node, text, parentChildren);
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
 * generated position — which Gecko reports at the key — is covered.
 *
 * `nameMappingLocations` = [key.from (if present), ...functionLocations]
 *
 * For MethodDeclaration, ParamList/Block are direct children (no FunctionExpression
 * wrapper). For Property with a function value, funcChild holds the wrapper.
 * Children are walked inside funcNode to avoid re-creating a scope for it.
 */
function _pushMethodScope(
  node: SyntaxNode,
  text: string,
  parentChildren: FunctionScope[]
): void {
  const funcChild =
    node.getChild('FunctionExpression') ?? node.getChild('ArrowFunction');

  // For MethodDeclaration (and method-shorthand Property), ParamList/Block are
  // direct children. For Property with a function value, funcChild is the wrapper.
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
    // Use the actual value's kind: arrow-valued properties (e.g. `{ foo: () => {} }`)
    // must be 'arrow' so source-map symbolication skips the funcOffset probe, which
    // resolves to the first parameter name rather than the function name.
    kind: funcChild?.name === 'ArrowFunction' ? 'arrow' : 'function',
    children: [],
  };
  parentChildren.push(scope);

  // Walk inside funcNode to avoid re-creating a scope for the wrapper itself.
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

/**
 * Parse `sourceText` with Lezer and return a synthetic root FunctionScope
 * whose children are the top-level function scopes found in the source.
 *
 * Lezer never throws on invalid JS — error nodes are silently skipped.
 */
export function parseJsScopeTree(sourceText: string): FunctionScope {
  const tree = lezerJsParser.parse(sourceText);
  const root: FunctionScope = {
    start: 0,
    end: sourceText.length,
    nameMappingLocations: [],
    astName: null,
    kind: 'function',
    children: [],
  };
  _walkChildren(tree.topNode, sourceText, root.children);
  return root;
}

/**
 * Find the innermost FunctionScope in the tree that contains `offset`.
 *
 * Returns the path from innermost to outermost as an array:
 *   result[0]        — the innermost scope (the one that directly contains offset)
 *   result.slice(1)  — ancestors, nearest first (parent, grandparent, …)
 *
 * The synthetic root scope is excluded from the result.
 * Returns null if no scope contains the offset.
 */
export function findInnermostFunctionScope(
  root: FunctionScope,
  offset: number
): FunctionScope[] | null {
  // search() returns the path [innermost, ...ancestors-up-to-but-not-including-root]
  // built by pushing each ancestor onto the array after recursing into children.
  function search(scope: FunctionScope): FunctionScope[] | null {
    if (offset < scope.start || offset >= scope.end) {
      return null;
    }
    for (const child of scope.children) {
      const found = search(child);
      if (found !== null) {
        // Append this scope as the next ancestor.
        found.push(scope);
        return found;
      }
    }
    // No child matched — this is the innermost.
    return [scope];
  }

  const path = search(root);
  if (path === null) {
    return null;
  }
  // The last element is the synthetic root (start=0, end=len, astName=null).
  // Remove it — it is never a useful named ancestor.
  path.pop();
  return path.length > 0 ? path : null;
}
