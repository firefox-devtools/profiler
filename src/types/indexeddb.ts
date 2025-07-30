// Coming from flow's source code:
// https://github.com/facebook/flow/blob/c8b17be6770568bb0ab4f7d865adbd6b38d5aa0e/lib/indexeddb.js
// See issue https://github.com/facebook/flow/issues/4143

// Fixed the interfaces, especially added some genericity,
// and changed so that it can be simply `import`ed.

// Implemented by window & worker
export interface IDBEnvironment {
  indexedDB: IDBFactory;
}

export type IDBDirection = 'next' | 'nextunique' | 'prev' | 'prevunique';

export interface IDBVersionChangeEvent extends Event {
  oldVersion: number;
  newVersion: number | null;
}

// Implemented by window.indexedDB & worker.indexedDB
export interface IDBFactory {
  open(name: string, version?: number): IDBOpenDBRequest;
  deleteDatabase(name: string): IDBOpenDBRequest;
  cmp<K>(a: K, b: K): -1 | 0 | 1;
}

export interface IDBRequest<V> extends EventTarget {
  result: V;
  error: Error;
  source: (
    | IDBIndex<any, any, V>
    | IDBObjectStore<any, V>
    | IDBCursor<any, any, V>
  ) | null;
  transaction: IDBTransaction;
  readyState: 'pending' | 'done';
  onerror: (e: Event & { target: IDBRequest<V> }) => unknown;
  onsuccess: (e: Event & { target: IDBRequest<V> }) => unknown;
}

export interface IDBOpenDBRequest extends IDBRequest<IDBDatabase> {
  onblocked: (e: IDBVersionChangeEvent & { target: IDBDatabase }) => unknown;
  onupgradeneeded: (
    e: IDBVersionChangeEvent & { target: IDBDatabase }
  ) => unknown;
}

export interface IDBDatabase extends EventTarget {
  close(): void;
  createObjectStore<K, V>(
    name: string,
    options?: {
      keyPath?: (string | string[]) | null,
      autoIncrement?: boolean,
    }
  ): IDBObjectStore<K, V>;
  deleteObjectStore(name: string): void;
  transaction(
    storeNames: string | string[],
    mode?: 'readonly' | 'readwrite' | 'versionchange'
  ): IDBTransaction;
  name: string;
  version: number;
  objectStoreNames: string[];
  onabort: (e: Event) => unknown;
  onerror: (e: Event) => unknown;
  onversionchange: (e: Event) => unknown;
}

export interface IDBTransaction extends EventTarget {
  abort(): void;
  db: IDBDatabase;
  error: Error;
  mode: 'readonly' | 'readwrite' | 'versionchange';
  name: string;
  objectStore<K, V>(name: string): IDBObjectStore<K, V>;
  onabort: (e: Event) => unknown;
  oncomplete: (e: Event) => unknown;
  onerror: (e: Event) => unknown;
}

export interface IDBObjectStore<K, V> {
  add(value: V, key?: K | null): IDBRequest<void>;
  autoIncrement: boolean;
  clear(): IDBRequest<void>;
  createIndex<L>(
    indexName: string,
    keyPath: string | string[],
    optionalParameter?: {
      unique?: boolean,
      multiEntry?: boolean,
    }
  ): IDBIndex<K, L, V>;
  count(keyRange?: K | IDBKeyRange<K>): IDBRequest<number>;
  delete(key: K): IDBRequest<void>;
  deleteIndex(indexName: string): void;
  get(key: K): IDBRequest<V>;
  getAll(query?: K | IDBKeyRange<K> | null, count?: number): IDBRequest<V[]>;
  getKey(key: K | IDBKeyRange<K>): IDBRequest<K>;
  getAllKeys(
    query?: K | IDBKeyRange<K> | null,
    count?: number
  ): IDBRequest<K[]>;
  index<L>(indexName: string): IDBIndex<K, L, V>;
  indexNames: string[];
  name: string;
  keyPath: string | string[] | null;
  openCursor(
    range?: K | IDBKeyRange<K>,
    direction?: IDBDirection
  ): IDBRequest<IDBCursorWithValue<K, K, V> | null>;
  openKeyCursor(
    range?: K | IDBKeyRange<K>,
    direction?: IDBDirection
  ): IDBRequest<IDBCursor<K, K, V> | null>;
  put(value: V, key?: K): IDBRequest<void>;
  transaction: IDBTransaction;
}

export interface IDBIndex<K, L, V> extends EventTarget {
  count(key?: L | IDBKeyRange<L>): IDBRequest<number>;
  get(key: L | IDBKeyRange<L>): IDBRequest<V>;
  getAll(query?: L | IDBKeyRange<L> | null, count?: number): IDBRequest<V[]>;
  getKey(key: L | IDBKeyRange<L>): IDBRequest<K>;
  getAllKeys(
    query?: L | IDBKeyRange<L> | null,
    count?: number
  ): IDBRequest<K[]>;
  openCursor(
    range?: L | IDBKeyRange<L>,
    direction?: IDBDirection
  ): IDBRequest<IDBCursorWithValue<K, L, V> | null>;
  openKeyCursor(
    range?: L | IDBKeyRange<L>,
    direction?: IDBDirection
  ): IDBRequest<IDBCursor<K, L, V> | null>;
  name: string;
  objectStore: IDBObjectStore<K, V>;
  keyPath: string | string[] | null;
  multiEntry: boolean;
  unique: boolean;
}

// TODO - Investigate for correctness, see:
// https://github.com/firefox-devtools/profiler/issues/718
export interface IDBKeyRange<K> {
  bound<J>(
    lower: J,
    upper: J,
    lowerOpen?: boolean,
    upperOpen?: boolean
  ): IDBKeyRange<J>;
  only<J>(value: J): IDBKeyRange<J>;
  lowerBound<J>(bound: J, open?: boolean): IDBKeyRange<J>;
  upperBound<J>(bound: J, open?: boolean): IDBKeyRange<J>;
  lower: K;
  upper: K;
  lowerOpen: boolean;
  upperOpen: boolean;
}

export interface IDBCursor<K, L, V> {
  advance(count: number): void;
  continue(key?: L): void;
  continuePrimaryKey(key: L, primaryKey: K): void;
  delete(): IDBRequest<void>;
  update(newValue: V): IDBRequest<void>;
  source: IDBObjectStore<K, V> | IDBIndex<K, L, V>;
  direction: IDBDirection;
  key: L;
  primaryKey: K;
}
export interface IDBCursorWithValue<K, L, V> extends IDBCursor<K, L, V> {
  value: V;
}