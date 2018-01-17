// flow-typed signature: 32d7ac68ff5341c1d782d472cef1644b
// flow-typed version: da30fe6876/react-addons-perf_v15.x.x/flow_>=v0.25.x

declare module "react-addons-perf" {
  declare function start(): void;
  declare function stop(): void;
  declare function printWasted(): void;
  declare function getLastMeasurements(): mixed;
  declare function printInclusive(): void;
  declare function printExclusive(): void;
  declare function printOperations(): void;
}
