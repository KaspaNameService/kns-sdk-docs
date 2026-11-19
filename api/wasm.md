# @knsdomains/wasm

The KNS wasm module as an npm package: `crates/kns-wasm` of covenant-domain, KNS's reference implementation (the
contracts, the command-line tool and the tracker, in a repository that is not public), built with wasm-bindgen for
the web and shipped here with its provenance. It builds, signs, verifies and submits every `.kas` name transaction.
The covenant address of a name is the hash of its compiled script, so the module carries the same silverscript
compiler and the same contract sources as the native build, and the native build compared the two byte for byte
before this file was produced (`PROVENANCE.json`).

Most programs want [`@knsdomains/sdk-tx`](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/api/sdk-tx.md),
which gives this module a typed interface, a signer port and the product rules. Use this package directly to load
the module yourself.

In a browser, or under a bundler, `load` fetches the `.wasm` next to the entry:

```ts
import { load } from '@knsdomains/wasm'

const wasm = await load()
wasm.api_version() // 'kns-wasm-api-v9'
wasm.supported_ops() // ['deploy-anchor', 'genesis-gap', 'register', 'transfer', …]
```

Under Node 22, `loadNode` reads it from disk:

```ts
import { loadNode } from '@knsdomains/wasm/node'

const wasm = await loadNode()
```

`load` refuses a module that speaks another `API_VERSION`. The entry re-exports the KNS functions alone and
leaves out `contract_fingerprints`, which pins sentinel deployment values into the instance for good; the raw
wasm-bindgen output, rusty-kaspa classes included, is at `@knsdomains/wasm/raw`.

## Where the `.wasm` comes from

`load()` asks for `new URL('./vendor/kns_wasm_bg.wasm', import.meta.url)`. `vite build` emits that file as an asset of
the build with no configuration, and so does any bundler that understands `new URL(…, import.meta.url)`. The dev
servers of Vite 6 and 7 pre-bundle dependencies into `node_modules/.vite/deps`, where that URL finds no `.wasm` and
`load()` fails with a `CompileError` that says _expected magic word_, so leave this package out of the pre-bundling.
The Vite 8 dev server needs nothing, and the line does no harm there:

```js
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: { exclude: ['@knsdomains/wasm'] }, // Vite 6 and 7 dev server: load the module from its own package folder
})
```

A bundler that does not understand `new URL(…, import.meta.url)`: copy `@knsdomains/wasm/kns_wasm_bg.wasm` into the build and
hand `load` its URL, its bytes, a `Response` or a compiled `WebAssembly.Module`: `load(url)`. Serve it as
`application/wasm`. A second `load()` answers the instance the first one made; a load that failed is not kept, so the
next call tries again.

A Chrome extension on Manifest V3 must allow WebAssembly in its pages and its service worker, or `load()` fails
with "Compiling or instantiating WebAssembly module violates the following Content Security policy directive". Add
to `manifest.json`:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

Tested on Chromium in an extension's popup and in its service worker; a service worker imports the package
statically, because it cannot use `import()`.

## Versions

The package version is `<api major>.x.y-src.<covenant-domain commit>`. `API_VERSION` moves when an op's
arguments or results change their meaning; adding an op or a field keeps it. One instance serves one lineage:
the deployment values a session carries are frozen on the first `run_op`, so a page that addresses two
registries instantiates the module twice.

## Size

|      | bytes     |
| ---- | --------- |
| raw  | 8,947,053 |
| gzip | 3,876,037 |

A read-only integrator never needs it; `@knsdomains/sdk` is pure TypeScript. A wallet loads it when the user opens a
screen that writes, not at start.

## Provenance

`PROVENANCE.json` names the covenant-domain commit the module was built from, the sha256 of the `.wasm`, and
the contract fingerprints the native build reported at that commit. Check the sha256 before trusting a copy.
Third-party licenses of the linked Rust crates are in `THIRD-PARTY-NOTICES.md`.

A module and the lineage `@knsdomains/sdk` bundles ship together only when the module derives that lineage's manifest
digest from its values: `tools/check-release.mjs` loads the module and refuses the release otherwise. A module
built from changed contracts derives other template hashes from the same values, so it waits for a lineage
deployed from those contracts.
