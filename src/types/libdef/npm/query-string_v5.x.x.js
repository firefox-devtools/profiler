// flow-typed signature: 2389e99bd2259b7242a44127a9c2d620
// flow-typed version: 576c24ae7e/query-string_v5.x.x/flow_>=v0.32.x

declare module "query-string" {
  declare type ArrayFormat = "none" | "bracket" | "index";
  declare type ParseOptions = {|
    arrayFormat?: ArrayFormat
  |};

  declare type StringifyOptions = {|
    arrayFormat?: ArrayFormat,
    encode?: boolean,
    strict?: boolean
  |};

  declare module.exports: {
    extract(str: string): string,
    parse(str: string, opts?: ParseOptions): Object,
    stringify(obj: Object, opts?: StringifyOptions): string
  };
}
