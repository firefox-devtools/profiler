module.exports = {
  singleQuote: true,
  trailingComma: 'es5',
  overrides: [
    {
      files: 'src/utils/path.js',
      options: {
        // New versions of Prettier rewrite Flow comments to non-comments, but
        // this is a problem in this file because it contains a Flow comment
        // that's not parsed properly by Babel.
        // This file uses Flow in a way that's Typescript compatible, so we can
        // use a typescript parser. This typescript parser doesn't rewrite
        // comments, so it works in this case.
        parser: 'babel-ts',
      },
    },
    {
      files: 'bin/*.js',
      options: {
        // Files in bin/ are javascript files that may use Flow comments. We
        // don't want the content of these Flow comments to be output outside of
        // comments so that the file can still be run directly with node.
        parser: 'espree',
      },
    },
  ],
};
