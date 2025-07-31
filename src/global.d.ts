/**
 * Global type definitions for Flow to TypeScript migration compatibility
 * These aliases allow gradual migration by providing TypeScript equivalents for Flow types
 */

// Flow utility types -> TypeScript equivalents
type $ReadOnly<T> = Readonly<T>;
type $Shape<T> = Partial<T>;
type $PropertyType<T, K extends keyof T> = T[K];
type $ElementType<T extends readonly unknown[], N extends number> = T[N];
type $Keys<T> = keyof T;
type $Values<T> = T[keyof T];

// Flow primitives -> TypeScript equivalents
type empty = never;
type mixed = unknown;

// Flow exact object type helper (transitional)
// In Flow: {| prop: Type |} -> In TypeScript: { prop: Type }
// This type alias can be used during migration for clarity
type $Exact<T> = T;

// Flow intersection and union helpers
type $Diff<A, B> = Omit<A, keyof B>;
type $Rest<A, B> = Omit<A, keyof B>;

// Firefox Profiler specific globals
declare var AVAILABLE_STAGING_LOCALES: string[] | null;

// Web Workers
interface Worker {
  postMessage(message: any, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((this: Worker, ev: MessageEvent) => any) | null;
  onerror: ((this: Worker, ev: ErrorEvent) => any) | null;
}
