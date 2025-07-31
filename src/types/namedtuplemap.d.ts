declare module 'namedtuplemap' {
  class NamedTupleMap<T = any> {
    constructor();
    get(...args: any[]): T | undefined;
    set(...args: any[]): T;
    has(...args: any[]): boolean;
    delete(...args: any[]): boolean;
    clear(): void;
  }

  export default NamedTupleMap;
}
