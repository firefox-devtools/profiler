module.exports = {
  singleQuote: true,
  trailingComma: 'es5',
  overrides: [
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
