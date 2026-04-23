/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  applyModifier,
  expandPattern,
  resolveTemplates,
} from '../../node-tools/profiler-edit';
import { insertStackLabels } from '../../profile-logic/insert-stack-labels';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { callTreeFromProfile, formatTree } from '../fixtures/utils';

// ---------------------------------------------------------------------------
// applyModifier
// ---------------------------------------------------------------------------

describe('applyModifier', function () {
  describe(':pascal', function () {
    it('uppercases the first letter of a camelCase name', function () {
      expect(applyModifier('querySelector', 'pascal')).toBe('QuerySelector');
    });

    it('handles multi-word camelCase', function () {
      expect(applyModifier('addEventListener', 'pascal')).toBe(
        'AddEventListener'
      );
    });

    it('preserves interior uppercase (innerHTML)', function () {
      expect(applyModifier('innerHTML', 'pascal')).toBe('InnerHTML');
    });

    it('handles a single lowercase letter', function () {
      expect(applyModifier('fill', 'pascal')).toBe('Fill');
    });
  });

  describe(':snake', function () {
    it('lowercases a simple PascalCase word', function () {
      expect(applyModifier('Element', 'snake')).toBe('element');
    });

    it('handles HTML* class names', function () {
      expect(applyModifier('HTMLInputElement', 'snake')).toBe(
        'html_input_element'
      );
    });

    it('handles DOM* class names', function () {
      expect(applyModifier('DOMTokenList', 'snake')).toBe('dom_token_list');
    });

    it('handles CSS* class names', function () {
      expect(applyModifier('CSSStyleSheet', 'snake')).toBe('css_style_sheet');
    });

    it('handles compound PascalCase names', function () {
      expect(applyModifier('DocumentFragment', 'snake')).toBe(
        'document_fragment'
      );
      expect(applyModifier('EventTarget', 'snake')).toBe('event_target');
      expect(applyModifier('ShadowRoot', 'snake')).toBe('shadow_root');
    });

    it('handles all-uppercase acronyms', function () {
      expect(applyModifier('URL', 'snake')).toBe('url');
      expect(applyModifier('DOMParser', 'snake')).toBe('dom_parser');
    });
  });

  it('returns the value unchanged when no modifier is given', function () {
    expect(applyModifier('querySelector', undefined)).toBe('querySelector');
    expect(applyModifier('Element', undefined)).toBe('Element');
  });

  it('throws on an unknown modifier', function () {
    expect(() => applyModifier('foo', 'upper')).toThrow(
      'Unknown template modifier: upper'
    );
  });
});

// ---------------------------------------------------------------------------
// expandPattern
// ---------------------------------------------------------------------------

describe('expandPattern', function () {
  it('substitutes a plain variable', function () {
    expect(
      expandPattern('mozilla::dom::{Class}_Binding::{method}(', {
        Class: 'Element',
        method: 'querySelector',
      })
    ).toBe('mozilla::dom::Element_Binding::querySelector(');
  });

  it('applies :pascal to the variable value', function () {
    expect(
      expandPattern('v8_{Class:snake}::{method:pascal}Operation', {
        Class: 'Element',
        method: 'querySelector',
      })
    ).toBe('v8_element::QuerySelectorOperation');
  });

  it('applies :snake to the variable value', function () {
    expect(
      expandPattern('v8_{Class:snake}::Callback', {
        Class: 'HTMLInputElement',
      })
    ).toBe('v8_html_input_element::Callback');
  });

  it('leaves unrelated text intact', function () {
    expect(expandPattern('no_vars_here', {})).toBe('no_vars_here');
  });

  it('throws when a referenced variable is not provided', function () {
    expect(() =>
      expandPattern('{Class}_Binding::{method}(', { Class: 'Element' })
    ).toThrow('Template variable "method" not provided');
  });
});

// ---------------------------------------------------------------------------
// resolveTemplates
// ---------------------------------------------------------------------------

const DOM_OPERATION_TEMPLATE = {
  name: 'dom_operation',
  patterns: [
    'mozilla::dom::{Class}_Binding::{method}(',
    "blink::`anonymous namespace'::v8_{Class:snake}::{method:pascal}Operation",
    'blink::(anonymous namespace)::v8_{Class:snake}::{method:pascal}Operation',
    'WebCore::js{Class}PrototypeFunction_{method}',
  ],
};

describe('resolveTemplates', function () {
  it('passes through explicit funcPrefixes unchanged', function () {
    const buckets = resolveTemplates(
      [{ name: 'GC', funcPrefixes: ['js::gc::GCRuntime::collect('] }],
      []
    );
    expect(buckets).toEqual([
      { name: 'GC', funcPrefixes: ['js::gc::GCRuntime::collect('] },
    ]);
  });

  it('expands a template application into funcPrefixes', function () {
    const buckets = resolveTemplates(
      [
        {
          name: 'Element.querySelector',
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'querySelector',
            },
          ],
        },
      ],
      [DOM_OPERATION_TEMPLATE]
    );
    expect(buckets).toEqual([
      {
        name: 'Element.querySelector',
        funcPrefixes: [
          'mozilla::dom::Element_Binding::querySelector(',
          "blink::`anonymous namespace'::v8_element::QuerySelectorOperation",
          'blink::(anonymous namespace)::v8_element::QuerySelectorOperation',
          'WebCore::jsElementPrototypeFunction_querySelector',
        ],
      },
    ]);
  });

  it('places explicit funcPrefixes before template-generated ones', function () {
    const buckets = resolveTemplates(
      [
        {
          name: 'set Element.className',
          funcPrefixes: ['blink::bindings::PerformAttributeSetCEReactions'],
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'setClassName',
            },
          ],
        },
      ],
      [DOM_OPERATION_TEMPLATE]
    );
    expect(buckets[0].funcPrefixes[0]).toBe(
      'blink::bindings::PerformAttributeSetCEReactions'
    );
    expect(buckets[0].funcPrefixes[1]).toBe(
      'mozilla::dom::Element_Binding::setClassName('
    );
  });

  it('handles multiple apply entries in one bucket', function () {
    const buckets = resolveTemplates(
      [
        {
          name: 'querySelector everywhere',
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'querySelector',
            },
            {
              template: 'dom_operation',
              Class: 'Document',
              method: 'querySelector',
            },
          ],
        },
      ],
      [DOM_OPERATION_TEMPLATE]
    );
    expect(buckets[0].funcPrefixes).toHaveLength(8); // 4 patterns × 2 apply entries
    expect(buckets[0].funcPrefixes[0]).toBe(
      'mozilla::dom::Element_Binding::querySelector('
    );
    expect(buckets[0].funcPrefixes[4]).toBe(
      'mozilla::dom::Document_Binding::querySelector('
    );
  });

  it('throws on an unknown template name', function () {
    expect(() =>
      resolveTemplates(
        [{ name: 'Test', apply: [{ template: 'nonexistent' }] }],
        []
      )
    ).toThrow('Unknown template: "nonexistent"');
  });
});

// ---------------------------------------------------------------------------
// Integration: templates → insertStackLabels → formatTree
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    name: 'dom_operation',
    patterns: [
      'mozilla::dom::{Class}_Binding::{method}(',
      "blink::`anonymous namespace'::v8_{Class:snake}::{method:pascal}Operation",
      'blink::(anonymous namespace)::v8_{Class:snake}::{method:pascal}Operation',
      'WebCore::js{Class}PrototypeFunction_{method}',
    ],
  },
  {
    name: 'canvas2d_operation',
    patterns: [
      'mozilla::dom::CanvasRenderingContext2D_Binding::{method}(',
      'mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::{method}(',
      "blink::`anonymous namespace'::v8_canvas_rendering_context_2d::{method:pascal}Operation",
      'blink::(anonymous namespace)::v8_canvas_rendering_context_2d::{method:pascal}Operation',
      'blink::Canvas2DRecorderContext::{method}(',
      'WebCore::jsCanvasRenderingContext2DPrototypeFunction_{method}(',
    ],
  },
];

describe('template integration with insertStackLabels', function () {
  it('matches Gecko-style function names generated from a dom_operation template', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      mozilla::dom::Element_Binding::querySelector(elem)
    `);

    const buckets = resolveTemplates(
      [
        {
          name: 'Element.querySelector',
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'querySelector',
            },
          ],
        },
      ],
      TEMPLATES
    );

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, buckets)))
    ).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - Element.querySelector (total: 1, self: —)',
      '      - mozilla::dom::Element_Binding::querySelector(elem) (total: 1, self: 1)',
    ]);
  });

  it('matches both anonymous-namespace forms for Blink', function () {
    const { profile } = getProfileFromTextSamples(`
      blink::\`anonymous namespace'::v8_element::QuerySelectorOperation
      blink::(anonymous namespace)::v8_element::QuerySelectorOperation
    `);

    const buckets = resolveTemplates(
      [
        {
          name: 'Element.querySelector',
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'querySelector',
            },
          ],
        },
      ],
      TEMPLATES
    );

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, buckets)))
    ).toEqual([
      '- Element.querySelector (total: 1, self: —)',
      "  - blink::`anonymous namespace'::v8_element::QuerySelectorOperation (total: 1, self: —)",
      '    - blink::(anonymous namespace)::v8_element::QuerySelectorOperation (total: 1, self: 1)',
    ]);
  });

  it('matches WebKit-style function names', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*)
    `);

    const buckets = resolveTemplates(
      [
        {
          name: 'Element.querySelector',
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'querySelector',
            },
          ],
        },
      ],
      TEMPLATES
    );

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, buckets)))
    ).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - Element.querySelector (total: 1, self: —)',
      '      - WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*) (total: 1, self: 1)',
    ]);
  });

  it('canvas2d_operation matches Gecko, Offscreen, Blink, and WebKit variants', function () {
    const { profile } = getProfileFromTextSamples(`
      mozilla::dom::CanvasRenderingContext2D_Binding::fillRect(args)
      mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::fillRect(args)
      blink::(anonymous namespace)::v8_canvas_rendering_context_2d::FillRectOperation
      WebCore::jsCanvasRenderingContext2DPrototypeFunction_fillRect(ctx)
    `);

    const buckets = resolveTemplates(
      [
        {
          name: 'CanvasRenderingContext2D.fillRect',
          apply: [{ template: 'canvas2d_operation', method: 'fillRect' }],
        },
      ],
      TEMPLATES
    );

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, buckets)))
    ).toEqual([
      '- CanvasRenderingContext2D.fillRect (total: 1, self: —)',
      '  - mozilla::dom::CanvasRenderingContext2D_Binding::fillRect(args) (total: 1, self: —)',
      '    - mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::fillRect(args) (total: 1, self: —)',
      '      - blink::(anonymous namespace)::v8_canvas_rendering_context_2d::FillRectOperation (total: 1, self: —)',
      '        - WebCore::jsCanvasRenderingContext2DPrototypeFunction_fillRect(ctx) (total: 1, self: 1)',
    ]);
  });

  it('explicit funcPrefixes and template patterns both match', function () {
    const { profile } = getProfileFromTextSamples(`
      blink::bindings::PerformAttributeSetCEReactionsReflectTypeString
      mozilla::dom::Element_Binding::set_className(args)
    `);

    const buckets = resolveTemplates(
      [
        {
          name: 'set Element.className',
          funcPrefixes: [
            'blink::bindings::PerformAttributeSetCEReactionsReflectTypeString',
          ],
          apply: [
            {
              template: 'dom_operation',
              Class: 'Element',
              method: 'set_className',
            },
          ],
        },
      ],
      TEMPLATES
    );

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, buckets)))
    ).toEqual([
      '- set Element.className (total: 1, self: —)',
      '  - blink::bindings::PerformAttributeSetCEReactionsReflectTypeString (total: 1, self: —)',
      '    - mozilla::dom::Element_Binding::set_className(args) (total: 1, self: 1)',
    ]);
  });
});
