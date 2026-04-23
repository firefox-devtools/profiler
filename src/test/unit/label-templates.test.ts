/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  expandPattern,
  reverseModifier,
  reverseBlinkSnake,
  compilePatternToRegex,
  discoverAutoLabels,
  resolveAllLabels,
} from 'firefox-profiler/utils/label-templates';
import type { AutoLabel } from 'firefox-profiler/utils/label-templates';

// ---------------------------------------------------------------------------
// expandPattern
// ---------------------------------------------------------------------------

describe('expandPattern', function () {
  it('substitutes a plain variable', function () {
    expect(
      expandPattern('{Class}.{method}', {
        Class: 'Element',
        method: 'querySelector',
      })
    ).toBe('Element.querySelector');
  });

  it('leaves unrelated text intact', function () {
    expect(expandPattern('no_vars_here', {})).toBe('no_vars_here');
  });

  it('throws when a referenced variable is not provided', function () {
    expect(() =>
      expandPattern('{Class}.{method}', { Class: 'Element' })
    ).toThrow('Template variable "method" not provided');
  });

  it('throws when a modifier is used in a label template', function () {
    expect(() =>
      expandPattern('{Class:blink_snake}', { Class: 'Element' })
    ).toThrow('Template modifier ":blink_snake" is not supported');
  });
});

// ---------------------------------------------------------------------------
// reverseSnake / reverseModifier
// ---------------------------------------------------------------------------

describe('reverseBlinkSnake', function () {
  it('reverses a single Pascal word', function () {
    expect(reverseBlinkSnake('element')).toBe('Element');
  });

  it('reverses a multi-word PascalCase name', function () {
    expect(reverseBlinkSnake('document_fragment')).toBe('DocumentFragment');
    expect(reverseBlinkSnake('event_target')).toBe('EventTarget');
  });

  it('uses the special-tokens list to recover all-uppercase fragments', function () {
    expect(reverseBlinkSnake('html_element')).toBe('HTMLElement');
    expect(reverseBlinkSnake('html_image_element')).toBe('HTMLImageElement');
    expect(reverseBlinkSnake('css_style_sheet')).toBe('CSSStyleSheet');
    expect(reverseBlinkSnake('xml_http_request')).toBe('XmlHttpRequest');
  });

  it('uses the special-tokens list to recover mixed-case fragments', function () {
    expect(reverseBlinkSnake('webgl_rendering_context')).toBe(
      'WebGLRenderingContext'
    );
    expect(reverseBlinkSnake('webgl2_rendering_context')).toBe(
      'WebGL2RenderingContext'
    );
    expect(reverseBlinkSnake('xpath_evaluator')).toBe('XPathEvaluator');
  });

  it('handles trailing digit-bearing tokens', function () {
    expect(reverseBlinkSnake('canvas_rendering_context_2d')).toBe(
      'CanvasRenderingContext2D'
    );
    expect(reverseBlinkSnake('canvas_2d')).toBe('Canvas2D');
  });
});

describe('reverseModifier', function () {
  it('reverses :pascal by lowercasing the first letter', function () {
    expect(reverseModifier('QuerySelector', 'pascal')).toBe('querySelector');
    expect(reverseModifier('Fill', 'pascal')).toBe('fill');
  });

  it('reverses :blink_snake using the special-tokens list', function () {
    expect(reverseModifier('html_input_element', 'blink_snake')).toBe(
      'HTMLInputElement'
    );
  });

  it('returns the value unchanged when no modifier is given', function () {
    expect(reverseModifier('Element', undefined)).toBe('Element');
  });

  it('throws on an unknown modifier', function () {
    expect(() => reverseModifier('foo', 'upper')).toThrow(
      'Unknown template modifier: upper'
    );
  });
});

// ---------------------------------------------------------------------------
// compilePatternToRegex
// ---------------------------------------------------------------------------

describe('compilePatternToRegex', function () {
  it('compiles a Mozilla-style operation pattern', function () {
    const { regex, vars } = compilePatternToRegex(
      'mozilla::dom::{Class}_Binding::{method}('
    );
    expect(vars).toEqual([
      { name: 'Class', modifier: undefined },
      { name: 'method', modifier: undefined },
    ]);
    const m = 'mozilla::dom::Element_Binding::querySelector(args)'.match(regex);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Element');
    expect(m![2]).toBe('querySelector');
  });

  it('compiles a Blink-style pattern with :blink_snake and :pascal', function () {
    const { regex, vars } = compilePatternToRegex(
      'blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation'
    );
    expect(vars).toEqual([
      { name: 'Class', modifier: 'blink_snake' },
      { name: 'method', modifier: 'pascal' },
    ]);
    const m =
      'blink::(anonymous namespace)::v8_html_image_element::SetSrcOperation'.match(
        regex
      );
    expect(m).not.toBeNull();
    expect(m![1]).toBe('html_image_element');
    expect(m![2]).toBe('SetSrc');
  });

  it('compiles a WebKit-style pattern', function () {
    const { regex } = compilePatternToRegex(
      'WebCore::js{Class}PrototypeFunction_{method}'
    );
    const m = 'WebCore::jsElementPrototypeFunction_querySelector(args)'.match(
      regex
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Element');
    expect(m![2]).toBe('querySelector');
  });

  it('refuses to match when the literal text does not appear', function () {
    const { regex } = compilePatternToRegex(
      'mozilla::dom::{Class}_Binding::{method}('
    );
    expect('mozilla::dom::Element_Other::foo('.match(regex)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// discoverAutoLabels / resolveAllLabels
// ---------------------------------------------------------------------------

const DOM_OPERATION_AUTO: AutoLabel = {
  nameTemplate: '{Class}.{method}',
  funcPrefixTemplates: [
    'mozilla::dom::{Class}_Binding::{method}(',
    "blink::`anonymous namespace'::v8_{Class:blink_snake}::{method:pascal}Operation",
    'blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation',
    'WebCore::js{Class}PrototypeFunction_{method}',
  ],
};

const DOM_SETTER_AUTO: AutoLabel = {
  nameTemplate: 'set {Class}.{prop}',
  funcPrefixTemplates: [
    'mozilla::dom::{Class}_Binding::set_{prop}(',
    "blink::`anonymous namespace'::v8_{Class:blink_snake}::{prop:pascal}AttributeSetCallback",
    'blink::(anonymous namespace)::v8_{Class:blink_snake}::{prop:pascal}AttributeSetCallback',
    'WebCore::setJS{Class}_{prop}(',
  ],
};

describe('discoverAutoLabels', function () {
  it('discovers a Mozilla-style operation', function () {
    const labels = discoverAutoLabels(
      [DOM_OPERATION_AUTO],
      ['mozilla::dom::Element_Binding::querySelector(args)']
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('Element.querySelector');
    expect(labels[0].funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::querySelector(',
    ]);
  });

  it('discovers a Blink-style operation, recovering Class via the special-tokens list', function () {
    const labels = discoverAutoLabels(
      [DOM_OPERATION_AUTO],
      ['blink::(anonymous namespace)::v8_html_image_element::ClickOperation']
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('HTMLImageElement.click');
    expect(labels[0].funcPrefixes).toEqual([
      'blink::(anonymous namespace)::v8_html_image_element::ClickOperation',
    ]);
  });

  it('collects every observed engine form under one label entry', function () {
    const labels = discoverAutoLabels(
      [DOM_OPERATION_AUTO],
      [
        'mozilla::dom::Element_Binding::querySelector(args)',
        'WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*)',
      ]
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('Element.querySelector');
    expect(labels[0].funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::querySelector(',
      'WebCore::jsElementPrototypeFunction_querySelector',
    ]);
  });

  it('deduplicates identical observed prefixes', function () {
    const labels = discoverAutoLabels(
      [DOM_OPERATION_AUTO],
      [
        'mozilla::dom::Element_Binding::querySelector(args)',
        'mozilla::dom::Element_Binding::querySelector(other_args)',
      ]
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::querySelector(',
    ]);
  });

  it('discovers a setter using a separate auto_labels entry', function () {
    const labels = discoverAutoLabels(
      [DOM_SETTER_AUTO],
      ['mozilla::dom::Element_Binding::set_id(args)']
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('set Element.id');
  });

  it('does not match a binding setter as a dom_operation method', function () {
    // `{method}` (camelCase, no modifier) must not swallow the `set_` of
    // `set_innerHTML`, otherwise dom_operation would synthesize a stray
    // "Element.set_innerHTML" label alongside dom_setter's "set Element.innerHTML".
    const labels = discoverAutoLabels(
      [DOM_OPERATION_AUTO, DOM_SETTER_AUTO],
      ['mozilla::dom::Element_Binding::set_innerHTML(args)']
    );
    expect(labels.map((l) => l.name)).toEqual(['set Element.innerHTML']);
  });
});

describe('resolveAllLabels', function () {
  // When two `[[auto_labels]]` entries synthesize a label with the same name
  // (e.g. a generic `{Class}.{method}` template and a specific
  // `CanvasRenderingContext2D.{method}` template both yielding
  // `CanvasRenderingContext2D.fill`), every matched funcPrefix should end up
  // on the merged label — not just the prefixes from whichever auto_labels
  // entry happened to be processed last. Previously the second entry
  // overwrote the first in `byName`, dropping the direct Blink call's prefix
  // (`blink::Canvas2DRecorderContext::fill(`) and leaving only the V8 wrapper
  // prefix, so direct C++ calls to `fill()` never got the label.
  const CANVAS_SPECIFIC_AUTO: AutoLabel = {
    nameTemplate: 'CanvasRenderingContext2D.{method}',
    funcPrefixTemplates: [
      "blink::`anonymous namespace'::v8_canvas_rendering_context_2d::{method:pascal}Operation",
      'blink::Canvas2DRecorderContext::{method}(',
    ],
  };

  it('merges prefixes when a generic and a specific auto_label produce the same name', function () {
    // Order of funcNames matters for catching the bug. When the C++ direct
    // call (only matched by CANVAS_SPECIFIC_AUTO) is processed first, the
    // `discovered` Map ends up with the specific entry inserted before the
    // generic entry. `[...discovered.values()]` then iterates specific
    // before generic, and the buggy `byName.set(l.name, l)` overwrites the
    // specific entry (with both prefixes) with the generic entry (with
    // only the V8 wrapper prefix). Putting the V8 wrapper first hides the
    // bug because the specific entry is then the last value iterated and
    // wins the overwrite by accident.
    const resolved = resolveAllLabels(
      [DOM_OPERATION_AUTO, CANVAS_SPECIFIC_AUTO],
      [],
      [
        // Direct Blink C++ call: matches only CANVAS_SPECIFIC_AUTO. Without
        // the merge fix this prefix gets dropped when the generic-auto
        // entry overwrites the specific one in `byName`.
        'blink::Canvas2DRecorderContext::fill() (canvas_2d_recorder_context.cc)',
        // V8 wrapper: matches both DOM_OPERATION_AUTO (via the generic
        // v8_{Class:blink_snake}::{method:pascal}Operation template) and
        // CANVAS_SPECIFIC_AUTO (via its method-only template). Both
        // synthesize the name `CanvasRenderingContext2D.fill`.
        "blink::`anonymous namespace'::v8_canvas_rendering_context_2d::FillOperationCallback(args)",
      ]
    );
    const fill = resolved.find(
      (l) => l.name === 'CanvasRenderingContext2D.fill'
    );
    expect(fill).toBeDefined();
    expect(fill!.funcPrefixes).toEqual(
      expect.arrayContaining([
        "blink::`anonymous namespace'::v8_canvas_rendering_context_2d::FillOperation",
        'blink::Canvas2DRecorderContext::fill(',
      ])
    );
    // And the result must have exactly one entry for this name, not one per
    // contributing auto_labels entry.
    expect(
      resolved.filter((l) => l.name === 'CanvasRenderingContext2D.fill')
    ).toHaveLength(1);
  });

  it('appends explicit [[labels]] prefixes onto an auto-discovered label of the same name', function () {
    const resolved = resolveAllLabels(
      [DOM_OPERATION_AUTO],
      [
        {
          name: 'Element.querySelector',
          funcPrefixes: ['SomeExtraPrefix::querySelector('],
        },
      ],
      ['mozilla::dom::Element_Binding::querySelector(args)']
    );
    const qs = resolved.find((l) => l.name === 'Element.querySelector');
    expect(qs).toBeDefined();
    expect(qs!.funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::querySelector(',
      'SomeExtraPrefix::querySelector(',
    ]);
  });

  it('deduplicates a prefix that appears in both auto-discovery and explicit labels', function () {
    const resolved = resolveAllLabels(
      [DOM_OPERATION_AUTO],
      [
        {
          name: 'Element.querySelector',
          funcPrefixes: ['mozilla::dom::Element_Binding::querySelector('],
        },
      ],
      ['mozilla::dom::Element_Binding::querySelector(args)']
    );
    const qs = resolved.find((l) => l.name === 'Element.querySelector');
    expect(qs!.funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::querySelector(',
    ]);
  });

  it('passes through an explicit-only label when nothing auto-discovers the same name', function () {
    const resolved = resolveAllLabels(
      [DOM_OPERATION_AUTO],
      [{ name: 'Custom Label', funcPrefixes: ['some::prefix('] }],
      []
    );
    expect(resolved).toEqual([
      { name: 'Custom Label', funcPrefixes: ['some::prefix('] },
    ]);
  });
});
