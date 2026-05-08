# Wasm test fixtures

Fixtures used by `src/test/unit/wasm-symbolication.test.ts`.

`named.wasm` is generated from `named.wat` with [wabt](https://github.com/WebAssembly/wabt):

```
wat2wasm --debug-names src/test/fixtures/wasm/named.wat -o src/test/fixtures/wasm/named.wasm
```

The `--debug-names` flag is required so the resulting binary contains a
`name` custom section with function names; without it, the parser would
have nothing to extract.

Both files are committed so the tests don't depend on `wabt` being
installed locally.
