// This module replaces the wasm-pack generated module 'gecko-profiler-demangle'
// in our tests.
// The reason for this replacement is the fact that wasm-pack (or rather,
// wasm-bindgen), when targeting the browser + bundlers, generates an ES6 module
// that node cannot deal with. Most importantly, it uses the syntax
// "import * as wasm from './gecko_profiler_demangle_bg';" in order to load
// the wasm module, which is currently only supported by bundlers.
// The long-term path to make this work correctly is to wait for node to
// support ES6 modules (and WASM as ES6 modules) natively [1]. It's possible
// that in the medium term, wasm-bindgen will get support for outputting JS
// files which work in both bundlers and in node natively [2].
// [1] https://medium.com/@giltayar/native-es-modules-in-nodejs-status-and-future-directions-part-i-ee5ea3001f71
// [2] https://github.com/rustwasm/wasm-bindgen/issues/233

// There's only one exported function.
// Do the simplest thing possible: no demangling.
export function demangle_any(s: string): string {
  return s;
}
