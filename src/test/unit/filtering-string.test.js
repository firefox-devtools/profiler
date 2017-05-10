import { stringFromFilter, filterFromString } from '../../content/filtering-string';

describe('unit/filtering-string', function () {
  describe('stringFromFilter', function () {
    it('generates a string from a filter object', function () {
      const filter = {
        include: {
          implementation: 'C++',
          paths: ['devtools/debugger', 'netwerk'],
        },
        exclude: {
          paths: ['glue'],
          implementation: null,
        },
        display: {
          hide: [15, 22],
          charge: [{ source: 10, target: 25 }],
          invertCallstack: true,
        },
      };

      const result = stringFromFilter(filter);
      [
        'implementation:C++',
        'path:devtools/debugger',
        'path:netwerk',
        '-path:glue',
        'invertCallstack',
        'hide:15',
        'hide:22',
        'charge:10:25',
      ].forEach(substring => {
        expect(result).toMatch(substring);
      });
    });
  });

  describe('filterFromString', function () {
    it('generates a filter from a string', function () {
      const strFilter = [
        'implementation:C++',
        'path:devtools/debugger',
        'path:netwerk',
        '-path:glue',
        'invertCallStack', // intentional case mismatch should work
        'hide:15',
        'hide:22',
        'charge:10:25',
      ].join(' ');

      const result = filterFromString(strFilter);

      const expected = {
        display: {
          charge: [{ source: 10, target: 25 }],
          hide: [15, 22],
          invertCallstack: true,
        },
        exclude: {
          paths: ['glue'],
          implementation: null,
        },
        include: {
          implementation: 'C++',
          paths: ['devtools/debugger', 'netwerk'],
        },
      };
      expect(result).toEqual(expected);
    });
  });
});
