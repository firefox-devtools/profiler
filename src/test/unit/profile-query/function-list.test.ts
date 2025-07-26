/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FunctionMap } from 'firefox-profiler/profile-query/function-map';
import {
  extractFunctionData,
  sortByTotal,
  sortBySelf,
  formatFunctionList,
  createTopFunctionLists,
  truncateFunctionName,
  type FunctionData,
} from '../../../profile-query/function-list';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import type { Lib } from 'firefox-profiler/types';

function createMockTree(functions: FunctionData[]) {
  return {
    getRoots: () => functions.map((_, i) => i),
    getNodeData: (index: number) => functions[index],
  };
}

describe('function-list', function () {
  describe('extractFunctionData', function () {
    it('extracts function data from a tree', function () {
      const { profile, derivedThreads } = getProfileFromTextSamples(`
        foo
        bar
      `);
      const [thread] = derivedThreads;
      const libs: Lib[] = profile.libs;

      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 100,
          self: 50,
          totalRelative: 0.5,
          selfRelative: 0.25,
        },
        {
          funcName: 'bar',
          funcIndex: 1,
          total: 80,
          self: 60,
          totalRelative: 0.4,
          selfRelative: 0.3,
        },
      ];

      const tree = createMockTree(functions);
      const result = extractFunctionData(tree, thread, libs);

      expect(result).toEqual(functions);
    });
  });

  describe('sortByTotal', function () {
    it('sorts functions by total time descending', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 50,
          self: 30,
          totalRelative: 0.25,
          selfRelative: 0.15,
        },
        {
          funcName: 'bar',
          funcIndex: 0,
          total: 100,
          self: 20,
          totalRelative: 0.5,
          selfRelative: 0.1,
        },
        {
          funcName: 'baz',
          funcIndex: 0,
          total: 75,
          self: 40,
          totalRelative: 0.375,
          selfRelative: 0.2,
        },
      ];

      const sorted = sortByTotal(functions);

      expect(sorted.map((f) => f.funcName)).toEqual(['bar', 'baz', 'foo']);
      expect(sorted.map((f) => f.total)).toEqual([100, 75, 50]);
    });

    it('does not mutate the original array', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 50,
          self: 30,
          totalRelative: 0.25,
          selfRelative: 0.15,
        },
        {
          funcName: 'bar',
          funcIndex: 0,
          total: 100,
          self: 20,
          totalRelative: 0.5,
          selfRelative: 0.1,
        },
      ];

      const original = [...functions];
      sortByTotal(functions);

      expect(functions).toEqual(original);
    });
  });

  describe('sortBySelf', function () {
    it('sorts functions by self time descending', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 100,
          self: 30,
          totalRelative: 0.5,
          selfRelative: 0.15,
        },
        {
          funcName: 'bar',
          funcIndex: 0,
          total: 50,
          self: 40,
          totalRelative: 0.25,
          selfRelative: 0.2,
        },
        {
          funcName: 'baz',
          funcIndex: 0,
          total: 75,
          self: 20,
          totalRelative: 0.375,
          selfRelative: 0.1,
        },
      ];

      const sorted = sortBySelf(functions);

      expect(sorted.map((f) => f.funcName)).toEqual(['bar', 'foo', 'baz']);
      expect(sorted.map((f) => f.self)).toEqual([40, 30, 20]);
    });
  });

  describe('formatFunctionList', function () {
    it('formats a complete list with no omissions', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 100,
          self: 50,
          totalRelative: 0.5,
          selfRelative: 0.25,
        },
        {
          funcName: 'bar',
          funcIndex: 0,
          total: 80,
          self: 40,
          totalRelative: 0.4,
          selfRelative: 0.2,
        },
      ];

      const result = formatFunctionList(
        'Top Functions',
        functions,
        10,
        'total',
        new Set([0]),
        new FunctionMap()
      );

      expect(result.title).toBe('Top Functions');
      expect(result.stats).toBeNull();
      expect(result.lines.length).toBe(2);
      expect(result.lines[0]).toContain('foo');
      expect(result.lines[0]).toContain('total: 100');
      expect(result.lines[1]).toContain('bar');
    });

    it('formats a list with omissions and shows stats', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'func1',
          funcIndex: 0,
          total: 100,
          self: 50,
          totalRelative: 0.333,
          selfRelative: 0.25,
        },
        {
          funcName: 'func2',
          funcIndex: 0,
          total: 90,
          self: 40,
          totalRelative: 0.3,
          selfRelative: 0.2,
        },
        {
          funcName: 'func3',
          funcIndex: 0,
          total: 80,
          self: 30,
          totalRelative: 0.267,
          selfRelative: 0.15,
        },
        {
          funcName: 'func4',
          funcIndex: 0,
          total: 70,
          self: 20,
          totalRelative: 0.233,
          selfRelative: 0.1,
        },
        {
          funcName: 'func5',
          funcIndex: 0,
          total: 60,
          self: 10,
          totalRelative: 0.2,
          selfRelative: 0.05,
        },
      ];

      const result = formatFunctionList(
        'Top Functions',
        functions,
        3,
        'self',
        new Set([0]),
        new FunctionMap()
      );

      expect(result.title).toBe('Top Functions');
      expect(result.lines.length).toBe(5); // 3 functions + blank line + stats line
      expect(result.stats).toEqual({
        omittedCount: 2,
        maxTotal: 70,
        maxSelf: 20,
        sumSelf: 30, // 20 + 10
      });
      expect(result.lines[3]).toBe('');
      expect(result.lines[4]).toContain('2 more functions omitted');
      expect(result.lines[4]).toContain('max total: 70');
      expect(result.lines[4]).toContain('max self: 20');
      expect(result.lines[4]).toContain('sum of self: 30');
    });

    it('formats entries with total first when sortKey is total', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 100,
          self: 50,
          totalRelative: 0.5,
          selfRelative: 0.25,
        },
      ];

      const result = formatFunctionList(
        'Top Functions',
        functions,
        10,
        'total',
        new Set([0]),
        new FunctionMap()
      );

      expect(result.lines[0]).toMatch(/total:.*self:/);
      expect(result.lines[0]).toContain('total: 100 (50.0%)');
      expect(result.lines[0]).toContain('self: 50 (25.0%)');
    });

    it('formats entries with self first when sortKey is self', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'foo',
          funcIndex: 0,
          total: 100,
          self: 50,
          totalRelative: 0.5,
          selfRelative: 0.25,
        },
      ];

      const result = formatFunctionList(
        'Top Functions',
        functions,
        10,
        'self',
        new Set([0]),
        new FunctionMap()
      );

      expect(result.lines[0]).toMatch(/self:.*total:/);
      expect(result.lines[0]).toContain('self: 50 (25.0%)');
      expect(result.lines[0]).toContain('total: 100 (50.0%)');
    });
  });

  describe('createTopFunctionLists', function () {
    it('creates two lists sorted by total and self', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'highTotal',
          funcIndex: 0,
          total: 100,
          self: 20,
          totalRelative: 0.5,
          selfRelative: 0.1,
        },
        {
          funcName: 'highSelf',
          funcIndex: 0,
          total: 50,
          self: 40,
          totalRelative: 0.25,
          selfRelative: 0.2,
        },
        {
          funcName: 'mid',
          funcIndex: 0,
          total: 75,
          self: 30,
          totalRelative: 0.375,
          selfRelative: 0.15,
        },
      ];

      const result = createTopFunctionLists(
        functions,
        10,
        new Set([0]),
        new FunctionMap()
      );

      expect(result.byTotal.title).toBe('Top Functions (by total time)');
      expect(result.bySelf.title).toBe('Top Functions (by self time)');

      // Check byTotal is sorted by total
      expect(result.byTotal.lines[0]).toContain('highTotal');
      expect(result.byTotal.lines[1]).toContain('mid');
      expect(result.byTotal.lines[2]).toContain('highSelf');

      // Check bySelf is sorted by self
      expect(result.bySelf.lines[0]).toContain('highSelf');
      expect(result.bySelf.lines[1]).toContain('mid');
      expect(result.bySelf.lines[2]).toContain('highTotal');
    });

    it('respects the limit and shows stats for omitted functions', function () {
      const functions: FunctionData[] = [
        {
          funcName: 'func1',
          funcIndex: 0,
          total: 100,
          self: 50,
          totalRelative: 0.4,
          selfRelative: 0.2,
        },
        {
          funcName: 'func2',
          funcIndex: 0,
          total: 90,
          self: 40,
          totalRelative: 0.36,
          selfRelative: 0.16,
        },
        {
          funcName: 'func3',
          funcIndex: 0,
          total: 80,
          self: 30,
          totalRelative: 0.32,
          selfRelative: 0.12,
        },
      ];

      const result = createTopFunctionLists(
        functions,
        2,
        new Set([0]),
        new FunctionMap()
      );

      // Each list should have 2 functions + blank + stats = 4 lines
      expect(result.byTotal.lines.length).toBe(4);
      expect(result.bySelf.lines.length).toBe(4);

      expect(result.byTotal.stats?.omittedCount).toBe(1);
      expect(result.bySelf.stats?.omittedCount).toBe(1);
    });
  });

  describe('truncateFunctionName', function () {
    it('returns names unchanged when they fit within the limit', function () {
      expect(truncateFunctionName('RtlUserThreadStart', 120)).toBe(
        'RtlUserThreadStart'
      );
      expect(truncateFunctionName('foo::bar::baz()', 120)).toBe(
        'foo::bar::baz()'
      );
      expect(
        truncateFunctionName('std::vector<int>::push_back(int const&)', 120)
      ).toBe('std::vector<int>::push_back(int const&)');
    });

    it('truncates simple C++ namespaced functions', function () {
      const name =
        'some::very::long::namespace::hierarchy::with::many::levels::FunctionName()';
      const result = truncateFunctionName(name, 50);

      // Should preserve the function name at the end
      expect(result).toContain('FunctionName()');
      // Should show some context at the beginning
      expect(result).toContain('some::');
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('truncates complex template parameters intelligently', function () {
      const name =
        'std::_Hash<std::_Umap_traits<SGuid,CPrivateData,std::_Uhash_compare<SGuid,std::hash<SGuid>,std::equal_to<SGuid>>,std::allocator<std::pair<SGuid const,CPrivateData>>,0>>::~_Hash()';
      const result = truncateFunctionName(name, 120);

      // Should preserve namespace prefix and function name
      expect(result).toContain('std::_Hash<');
      expect(result).toContain('~_Hash()');
      // Should have collapsed some template parameters
      expect(result.length).toBeLessThanOrEqual(120);
    });

    it('truncates function parameters while preserving function name', function () {
      const name =
        'mozilla::wr::RenderThread::UpdateAndRender(mozilla::wr::WrWindowId, mozilla::layers::BaseTransactionId<mozilla::wr::RenderRootType>)';
      const result = truncateFunctionName(name, 120);

      // Function name should always be preserved
      expect(result).toContain('UpdateAndRender(');
      expect(result).toContain(')');
      // Should preserve context
      expect(result).toContain('mozilla::wr::RenderThread::');
      expect(result.length).toBeLessThanOrEqual(120);
    });

    it('handles library prefixes correctly', function () {
      const name =
        'nvoglv64.dll!mozilla::wr::RenderThread::UpdateAndRender(mozilla::wr::WrWindowId)';
      const result = truncateFunctionName(name, 120);

      // Library prefix should be preserved
      expect(result).toStartWith('nvoglv64.dll!');
      // Function should still be visible
      expect(result).toContain('UpdateAndRender');
      expect(result.length).toBeLessThanOrEqual(120);
    });

    it('handles very long library prefixes gracefully', function () {
      const name =
        'a-very-long-library-name-that-is-too-long.dll!FunctionName()';
      const result = truncateFunctionName(name, 30);

      // Should fall back to simple truncation
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result).toContain('...');
    });

    it('truncates nested templates by collapsing inner content', function () {
      const name =
        'mozilla::interceptor::FuncHook<mozilla::interceptor::WindowsDllInterceptor<mozilla::interceptor::VMSharingPolicyShared>>::operator()';
      const result = truncateFunctionName(name, 120);

      // Should show outer template structure
      expect(result).toContain('FuncHook<');
      expect(result).toContain('operator()');
      // Inner templates should be collapsed
      expect(result.length).toBeLessThanOrEqual(120);
    });

    it('handles functions with no namespaces', function () {
      const name = 'malloc';
      expect(truncateFunctionName(name, 120)).toBe('malloc');

      const name2 = 'RtlUserThreadStart';
      expect(truncateFunctionName(name2, 120)).toBe('RtlUserThreadStart');
    });

    it('handles empty parameters', function () {
      expect(truncateFunctionName('foo::bar()', 120)).toBe('foo::bar()');
      expect(truncateFunctionName('SomeClass::Method()', 120)).toBe(
        'SomeClass::Method()'
      );
    });

    it('breaks at namespace boundaries when truncating prefix', function () {
      const name =
        'namespace1::namespace2::namespace3::namespace4::namespace5::FunctionName()';
      const result = truncateFunctionName(name, 50);

      // Should break at :: boundaries, not mid-word
      expect(result).not.toMatch(/[a-z]::[A-Z]/); // No broken words
      expect(result).toContain('FunctionName()');
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('preserves closing parenthesis for functions with parameters', function () {
      const name = 'SomeClass::Method(int, std::string, std::vector<double>)';
      const result = truncateFunctionName(name, 40);

      // Should always have matching parentheses
      expect(result).toContain('Method(');
      expect(result).toContain(')');
      expect(result.length).toBeLessThanOrEqual(40);
    });

    it('handles deeply nested templates', function () {
      const name =
        'std::vector<std::pair<int,std::map<std::string,std::vector<double>>>>';
      const result = truncateFunctionName(name, 50);

      // Should show outer structure
      expect(result).toContain('std::vector<');
      expect(result).toContain('>');
      // Should have collapsed inner content
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('allocates more space to suffix (function name) when possible', function () {
      const name =
        'short::VeryLongFunctionNameThatShouldBePreservedBecauseItIsImportant(parameter1, parameter2, parameter3)';
      const result = truncateFunctionName(name, 100);

      // Function name should be prioritized over prefix
      expect(result).toContain('VeryLongFunctionName');
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('handles mixed templates and parameters', function () {
      const name =
        'std::map<std::string,int>::insert(std::pair<std::string const,int> const&)';
      const result = truncateFunctionName(name, 60);

      expect(result).toContain('insert(');
      expect(result).toContain(')');
      expect(result.length).toBeLessThanOrEqual(60);
    });

    it('returns consistent results for the same input', function () {
      const name =
        'mozilla::wr::RenderThread::UpdateAndRender(mozilla::wr::WrWindowId)';
      const result1 = truncateFunctionName(name, 100);
      const result2 = truncateFunctionName(name, 100);

      expect(result1).toBe(result2);
    });

    it('handles edge case of very small maxLength', function () {
      const name = 'SomeClass::SomeMethod()';
      const result = truncateFunctionName(name, 15);

      // Should still produce something reasonable and prioritize the function name
      expect(result.length).toBeLessThanOrEqual(15);
      expect(result.length).toBeGreaterThan(0);
      // When space is very limited, it may drop the namespace to show the function name
      expect(result).toContain('SomeMethod');
    });

    it('handles names with only templates and no function name', function () {
      const name = 'std::vector<int>';
      const result = truncateFunctionName(name, 50);

      expect(result).toContain('std::vector<');
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('truncates while preserving critical structure markers', function () {
      const name = 'foo::bar<baz>::qux(param1, param2, param3, param4)';
      const result = truncateFunctionName(name, 35);

      // Should maintain bracket pairing
      const openAngles = (result.match(/</g) || []).length;
      const closeAngles = (result.match(/>/g) || []).length;
      const openParens = (result.match(/\(/g) || []).length;
      const closeParens = (result.match(/\)/g) || []).length;

      // All opened brackets should be closed
      expect(openAngles).toBe(closeAngles);
      expect(openParens).toBe(closeParens);
      expect(result.length).toBeLessThanOrEqual(35);
    });
  });
});
