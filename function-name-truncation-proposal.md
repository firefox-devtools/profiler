# Smart Function Name Truncation Proposal

## Problem Statement

Current truncation in pq cuts function names at arbitrary character positions, breaking in the middle of words and losing critical information:

```
Bad: mozilla::interceptor::FuncHook<mozilla::interceptor::Wind...
Bad: std::_Hash<std::_Umap_traits<SGuid,CPrivateData,std::_Uhash_compare<SGuid,...
```

This makes output hard to read and removes the most diagnostic part: **the actual function name**.

## Goal

Preserve both **context** (namespace/class) and **function name** by showing start and end:

```
Good: mozilla::interceptor::FuncHook<mozilla::interceptor::WindowsDllInterceptor<...>>::operator()
Good: std::_Hash<std::_Umap_traits<SGuid,CPrivateData,...>>::~_Hash()
Good: mozilla::wr::RenderThread::UpdateAndRender(...)
```

## Key Insights

1. **Function name is at the end** - Method names, function names, operators appear after all namespace/template noise
2. **Middle is noise** - Template parameters and nested namespaces in the middle can be elided
3. **Proper nesting matters** - Can't break inside `<...>` or `(...)` without understanding the structure
4. **Uniform limit works** - With smart truncation, a single high limit (e.g., 120 chars) works everywhere

## Algorithm Overview

### Step 1: Parse the Function Name Structure

Parse the function name into tokens, tracking nesting depth:

```typescript
type Token = {
  text: string;
  type: 'text' | 'open' | 'close';
  depth: number; // Nesting depth at this point
};
```

**Parsing rules:**

- `<` and `(` are "open" tokens, increase depth
- `>` and `)` are "close" tokens, decrease depth
- Everything else is "text"
- Split "text" at `::` boundaries for namespace resolution

**Example:**

```
Input: std::vector<std::pair<int,std::string>>::iterator

Tokens:
  { text: "std", type: "text", depth: 0 }
  { text: "::", type: "text", depth: 0 }
  { text: "vector", type: "text", depth: 0 }
  { text: "<", type: "open", depth: 0 }  // depth becomes 1
  { text: "std::pair", type: "text", depth: 1 }
  { text: "<", type: "open", depth: 1 }  // depth becomes 2
  { text: "int,std::string", type: "text", depth: 2 }
  { text: ">", type: "close", depth: 2 } // depth becomes 1
  { text: ">", type: "close", depth: 1 } // depth becomes 0
  { text: "::", type: "text", depth: 0 }
  { text: "iterator", type: "text", depth: 0 }
```

### Step 2: Identify Prefix and Suffix Regions

**Prefix:** Everything up to the last top-level (depth 0) `::` or opening bracket
**Suffix:** Function name + parameters + template suffix

Examples:

```
mozilla::wr::RenderThread::UpdateAndRender(mozilla::wr::WrWindowId)
^------ prefix -------^      ^--------- suffix ---------^

std::_Hash<std::_Umap_traits<...>>::~_Hash()
^-- prefix --^                ^- suffix -^
```

### Step 3: Truncate Intelligently

If `prefix.length + suffix.length + 3 <= maxLength`:

- Return full name (no truncation needed)

Else:

- Calculate available space: `available = maxLength - 3` (for "...")
- Allocate to suffix: `suffixLen = min(suffix.length, available * 0.4)` (40% of space)
- Allocate to prefix: `prefixLen = available - suffixLen`
- Truncate prefix at **top-level namespace boundary** (depth 0, at `::`)
- Truncate suffix from start, preserving **complete parameter lists and template args**
- Return `prefix + "..." + suffix`

### Step 4: Handle Edge Cases

**Very long suffix (function name itself is huge):**

```
someFunctionWithRidiculouslyLongNameThatKeepsGoingForever()
```

- Still preserve `(...)` or `()` at the end
- Truncate the name itself if needed: `someFunctionWithRidicu...KeepsGoingForever()`

**Nested templates exceeding available space:**

```
std::vector<std::pair<int,std::map<std::string,std::vector<double>>>>
```

- Preserve outer structure: `std::vector<std::pair<...>>`
- Replace entire inner nesting with `...`

**No namespaces (C functions, simple names):**

```
RtlUserThreadStart
malloc
```

- No prefix to preserve
- Return full name if it fits
- Simple truncation from start if it doesn't: `RtlUserThread...`

## Implementation

### Core Function Signature

```typescript
/**
 * Intelligently truncate a function name, preserving context and function name.
 *
 * @param functionName - The function name to truncate (without library prefix)
 * @param maxLength - Maximum length for truncated output
 * @returns Truncated function name, or original if it fits
 */
export function truncateFunctionName(
  functionName: string,
  maxLength: number
): string;
```

**Note:** Library prefix (`nvoglv64.dll!`) is added AFTER truncation by the caller. This function only handles the function name itself.

### Parsing Implementation

```typescript
type Token = {
  text: string;
  type: 'text' | 'open' | 'close';
  nestingDepth: number;
};

function tokenizeFunctionName(name: string): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  let currentText = '';

  for (let i = 0; i < name.length; i++) {
    const char = name[i];

    if (char === '<' || char === '(') {
      // Flush any accumulated text
      if (currentText) {
        tokens.push({ text: currentText, type: 'text', nestingDepth: depth });
        currentText = '';
      }
      tokens.push({ text: char, type: 'open', nestingDepth: depth });
      depth++;
    } else if (char === '>' || char === ')') {
      // Flush any accumulated text
      if (currentText) {
        tokens.push({ text: currentText, type: 'text', nestingDepth: depth });
        currentText = '';
      }
      depth--;
      tokens.push({ text: char, type: 'close', nestingDepth: depth });
    } else {
      currentText += char;
    }
  }

  // Flush remaining text
  if (currentText) {
    tokens.push({ text: currentText, type: 'text', nestingDepth: depth });
  }

  return tokens;
}
```

### Truncation Implementation

```typescript
function truncateFunctionName(functionName: string, maxLength: number): string {
  if (functionName.length <= maxLength) {
    return functionName;
  }

  const tokens = tokenizeFunctionName(functionName);

  // Find the last top-level namespace separator (depth 0, "::")
  let lastTopLevelSeparatorIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (
      tokens[i].nestingDepth === 0 &&
      tokens[i].type === 'text' &&
      tokens[i].text.includes('::')
    ) {
      // Find the last :: in this token
      const lastColons = tokens[i].text.lastIndexOf('::');
      if (lastColons !== -1) {
        lastTopLevelSeparatorIndex = i;
        break;
      }
    }
  }

  // Split into prefix and suffix
  let prefixTokens: Token[];
  let suffixTokens: Token[];

  if (lastTopLevelSeparatorIndex !== -1) {
    // Split at the namespace separator
    const sepToken = tokens[lastTopLevelSeparatorIndex];
    const lastColons = sepToken.text.lastIndexOf('::');

    prefixTokens = tokens.slice(0, lastTopLevelSeparatorIndex);
    prefixTokens.push({
      text: sepToken.text.substring(0, lastColons + 2),
      type: 'text',
      nestingDepth: 0,
    });

    const remainingText = sepToken.text.substring(lastColons + 2);
    suffixTokens = [];
    if (remainingText) {
      suffixTokens.push({ text: remainingText, type: 'text', nestingDepth: 0 });
    }
    suffixTokens.push(...tokens.slice(lastTopLevelSeparatorIndex + 1));
  } else {
    // No namespace separator, everything is suffix
    prefixTokens = [];
    suffixTokens = tokens;
  }

  const prefix = tokensToString(prefixTokens);
  const suffix = tokensToString(suffixTokens);

  const ellipsis = '...';
  const available = maxLength - ellipsis.length;

  // Allocate space: 40% to suffix (the function name), 60% to prefix (context)
  const suffixLength = Math.min(suffix.length, Math.floor(available * 0.4));
  const prefixLength = available - suffixLength;

  // Truncate prefix at top-level namespace boundaries
  const truncatedPrefix = truncatePrefix(prefixTokens, prefixLength);

  // Truncate suffix, preserving structure
  const truncatedSuffix = truncateSuffix(suffixTokens, suffixLength);

  return truncatedPrefix + ellipsis + truncatedSuffix;
}

function tokensToString(tokens: Token[]): string {
  return tokens.map((t) => t.text).join('');
}

function truncatePrefix(tokens: Token[], maxLength: number): string {
  // Build prefix up to maxLength, preferring to break at namespace boundaries (::)
  let result = '';

  for (const token of tokens) {
    if (token.nestingDepth > 0) {
      // Inside template or params, skip entire nested section if it doesn't fit
      const remaining = tokensToString(tokens.slice(tokens.indexOf(token)));
      if (result.length + remaining.length <= maxLength) {
        result += token.text;
      } else {
        // Can't fit, stop here
        break;
      }
    } else {
      // Top level text
      if (result.length + token.text.length <= maxLength) {
        result += token.text;
      } else {
        // Try to fit partial token, breaking at ::
        const parts = token.text.split('::');
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i] + (i < parts.length - 1 ? '::' : '');
          if (result.length + part.length <= maxLength) {
            result += part;
          } else {
            break;
          }
        }
        break;
      }
    }
  }

  return result;
}

function truncateSuffix(tokens: Token[], maxLength: number): string {
  // Take from the end, preserving complete structures
  let result = '';
  let depth = 0;

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];

    if (token.type === 'close') {
      depth++;
      result = token.text + result;
    } else if (token.type === 'open') {
      depth--;
      result = token.text + result;
    } else {
      // Text token
      if (depth > 0 || result.length + token.text.length <= maxLength) {
        // Either we're inside nested structure (must include), or it fits
        result = token.text + result;
      } else {
        // Try to fit partial text from end
        const availableSpace = maxLength - result.length;
        if (availableSpace > 0) {
          const truncatedText = token.text.substring(
            token.text.length - availableSpace
          );
          result = truncatedText + result;
        }
        break;
      }
    }

    if (result.length >= maxLength && depth === 0) {
      break;
    }
  }

  return result;
}
```

## Examples

### Example 1: C++ Template-Heavy Function

**Input:**

```
std::_Hash<std::_Umap_traits<SGuid,CPrivateData,std::_Uhash_compare<SGuid,std::hash<SGuid>,std::equal_to<SGuid>>,std::allocator<std::pair<SGuid const,CPrivateData>>,0>>::~_Hash()
```

**Tokens (simplified):**

```
"std::_Hash" (depth 0)
"<" (depth 0→1)
"std::_Umap_traits" (depth 1)
"<" (depth 1→2)
... (depth 2, nested templates)
">" (depth 2→1)
">" (depth 1→0)
"::" (depth 0)
"~_Hash()" (depth 0)
```

**Truncated (120 chars):**

```
std::_Hash<std::_Umap_traits<SGuid,CPrivateData,...>>::~_Hash()
```

### Example 2: Mozilla Namespace-Heavy Function

**Input:**

```
mozilla::interceptor::FuncHook<mozilla::interceptor::WindowsDllInterceptor<mozilla::interceptor::VMSharingPolicyShared>>::operator()
```

**Truncated (120 chars):**

```
mozilla::interceptor::FuncHook<mozilla::interceptor::WindowsDllInterceptor<...>>::operator()
```

### Example 3: WebRender Function with Params

**Input:**

```
mozilla::wr::RenderThread::UpdateAndRender(mozilla::wr::WrWindowId, mozilla::layers::BaseTransactionId<mozilla::wr::RenderRootType>)
```

**Truncated (120 chars):**

```
mozilla::wr::RenderThread::UpdateAndRender(mozilla::wr::WrWindowId, mozilla::layers::BaseTransactionId<...>)
```

### Example 4: Short Function (No Truncation)

**Input:**

```
RtlUserThreadStart
```

**Truncated (120 chars):**

```
RtlUserThreadStart
```

### Example 5: Very Long Function Name

**Input:**

```
someRidiculouslyLongFunctionNameThatJustKeepsGoingAndGoingWithoutAnyTemplatesOrNamespaces()
```

**Truncated (120 chars):**

```
someRidiculouslyLongFunctionNameThatJustKeepsGoingAndGoingWi...sOrNamespaces()
```

## Benefits

1. **Readability**: Can always see what function you're looking at
2. **Context**: Namespace/class information is preserved
3. **No mid-word breaks**: Respects C++ syntax structure
4. **Uniform limit**: One limit (120 chars) works everywhere
5. **Graceful degradation**: Falls back to simple truncation when structure is unclear

## Implementation Plan

1. **Phase 1:** Implement tokenizer and basic truncation
2. **Phase 2:** Add smart prefix/suffix selection
3. **Phase 3:** Handle edge cases (nested templates, very long names)
4. **Phase 4:** Add tests with real-world function names from profiles
5. **Phase 5:** Update all call sites to use new truncation

## Recommended Limits

With smart truncation, we can use **higher, uniform limits**:

- **120 characters** everywhere (function lists, call trees, heaviest stack)
- No need for different limits per context
- Smart truncation ensures short names stay short
- Long names get intelligently truncated with preserved meaning

## Migration

**Before:** Different limits, dumb truncation

```typescript
truncateFunctionName(name, 100); // Function lists
truncateFunctionName(name, 60); // Call trees
```

**After:** Uniform limit, smart truncation

```typescript
truncateFunctionName(name, 120); // Everywhere
```

Callers don't need to change - just update the implementation of `truncateFunctionName()`.
