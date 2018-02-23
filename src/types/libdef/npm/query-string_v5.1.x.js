// flow-typed signature: c55461580afaeb584bc187ba63ff817b
// flow-typed version: 8fea42b7f8/query-string_v5.1.x/flow_>=v0.32.x

declare module 'query-string' {
  declare type ArrayFormat = 'none' | 'bracket' | 'index'
  declare type ParseOptions = {|
    arrayFormat?: ArrayFormat,
  |}

  declare type StringifyOptions = {|
    arrayFormat?: ArrayFormat,
    encode?: boolean,
    strict?: boolean,
  |}

  declare module.exports: {
    extract(str: string): string,
    parse(str: string, opts?: ParseOptions): Object,
    parseUrl(str: string, opts?: ParseOptions): { url: string, query: Object },
    stringify(obj: Object, opts?: StringifyOptions): string,
  }
}
