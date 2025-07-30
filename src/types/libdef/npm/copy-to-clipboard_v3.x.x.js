// flow-typed signature: b5f1c8d3b5f12bd087ea217b3bb081bc
// flow-typed version: c6154227d1/copy-to-clipboard_v3.x.x/flow_>=v0.25.x <=v0.103.x

declare module 'copy-to-clipboard' {
  declare export type Options = {
    debug?: boolean,
    message?: string,
  };

  declare module.exports: (text: string, options?: Options) => boolean;
}
