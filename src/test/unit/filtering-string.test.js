import { stringFromFilter, filterFromString } from '../../content/filtering-string';

describe('unit/filtering-string', function () {
  describe('stringFromFilter', function () {
    it('generates a string from a filter object', function () {
      const filter = {
        cachedString: '',
        include: {
          implementation: 'cpp',
          paths: ['devtools/debugger', 'netwerk'],
          substrings: ['doPaint', 'doLayout'],
        },
        exclude: {
          paths: ['glue'],
          substrings: ['HelloWorld', 'FooBar'],
          implementation: null,
        },
        display: {
          hide: [15, 22],
          charge: [{ source: 10, target: 25 }],
          invertCallstack: true,
          hidePlatformDetails: true,
        },
      };

      const result = stringFromFilter(filter);
      [
        'implementation:cpp',
        'path:devtools/debugger',
        'path:netwerk',
        '-path:glue',
        'invertCallstack',
        'hide:15',
        'hide:22',
        'charge:10:25',
        '-substring:HelloWorld',
        '-substring:FooBar',
        'substring:doPaint',
        'substring:doLayout',
        'hidePlatformDetails',
      ].forEach(substring => {
        expect(result).toMatch(substring);
      });
    });

    it('keeps the cached string if present and valid', function () {
      const filter = {
        cachedString: 'DoReflow',
        include: {
          implementation: null,
          paths: [],
          substrings: ['DoReflow'],
        },
        exclude: null,
        display: {
          hide: [],
          charge: [],
          invertCallstack: false,
          hidePlatformDetails: false,
        },
      };

      const result = stringFromFilter(filter);

      // If we weren't using the cached string, we'd have substring:DoReflow
      expect(result).toBe('DoReflow');
    });

    it('does not keep the cached string if present but invalid', function () {
      const filter = {
        cachedString: 'DoReflow',
        include: null,
        exclude: null,
        display: {
          hide: [],
          charge: [],
          invertCallstack: false,
          hidePlatformDetails: false,
        },
      };

      const result = stringFromFilter(filter);
      expect(result).toBe('');
    });
  });

  describe('filterFromString', function () {
    it('generates a filter from a string', function () {
      const strFilter = [
        'implementation:cpp',
        'doLayout',
        'substring:doPaint',
        'path:devtools/debugger',
        'path:netwerk',
        '-path:glue',
        '-HelloWorld',
        '-substring:FooBar',
        'invertCallStack', // intentional case mismatch should work
        'hide:15',
        'hide:22',
        'charge:10:25',
        'hidePlatformDetails',
      ].join(' ');

      const result = filterFromString(strFilter);

      const expected = {
        cachedString: strFilter,
        display: {
          charge: [{ source: 10, target: 25 }],
          hide: [15, 22],
          invertCallstack: true,
          hidePlatformDetails: true,
        },
        exclude: {
          paths: ['glue'],
          substrings: ['HelloWorld', 'FooBar'],
          implementation: null,
        },
        include: {
          implementation: 'cpp',
          paths: ['devtools/debugger', 'netwerk'],
          substrings: ['doLayout', 'doPaint'],
        },
      };
      expect(result).toEqual(expected);
    });
  });
});
