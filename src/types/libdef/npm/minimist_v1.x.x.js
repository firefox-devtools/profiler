// flow-typed signature: 4f1f9ccb55e99cfffea0ffa6566add59
// flow-typed version: c6154227d1/minimist_v1.x.x/flow_>=v0.28.x <=v0.103.x

declare module 'minimist' {
  declare type minimistOptions = {
    string?: string | Array<string>,
    boolean?: boolean | string | Array<string>,
    alias?: { [arg: string]: string | Array<string> },
    default?: { [arg: string]: any },
    stopEarly?: boolean,
    // TODO: Strings as keys don't work...
    // '--'? boolean,
    unknown?: (param: string) => boolean
  };

  declare type minimistOutput = {
    _: Array<string>,
    [flag: string]: string | boolean
  };

  declare module.exports: (argv: Array<string>, opts?: minimistOptions) => minimistOutput;
}
