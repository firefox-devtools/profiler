// flow-typed signature: 31dc7d663d7caea94ebaa80bdbd574fc
// flow-typed version: a58fd07d7d/copy-to-clipboard_v3.x.x/flow_>=v0.25.x

declare module 'copy-to-clipboard' {
  declare export type Options = {|
    debug?: boolean,
    message?: string,
  |};

  declare module.exports: (text: string, options?: Options) => boolean;
}
