;; Tiny wasm module used as a test fixture for parseWasmFunctionNames /
;; applyWasmSymbolication. The function index space starts with imports,
;; so the indices recorded in the "name" custom section are:
;;   0 -> log   (imported)
;;   1 -> add
;;   2 -> sub
;; This is the same numbering Firefox uses for `wasm-function[N]`.
(module
  (import "env" "log" (func $log (param i32)))
  (func $add (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.add)
  (func $sub (param i32 i32) (result i32)
    local.get 0
    local.get 1
    i32.sub)
  (export "add" (func $add))
  (export "sub" (func $sub)))
