// flow-typed signature: 331b4c1d398890147570f4ea0fe0ec7a
// flow-typed version: b43dff3e0e/react-addons-perf_v15.x.x/flow_>=v0.16.x

declare module 'react-addons-perf' {
  declare function start(): void;
  declare function stop(): void;
  declare function printWasted(): void;
  declare function getLastMeasurements(): mixed;
  declare function printInclusive(): void;
  declare function printExclusive(): void;
  declare function printOperations(): void;
}

