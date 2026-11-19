# KNS for wallets

`.kas` names on Kaspa testnet-10, for wallet providers: send to a name, show names where addresses would be, and
register, transfer, list and buy names through your own signer.

**Start with the [quickstart](quickstart.md)**: each task a wallet needs, as one short recipe.

Built from kns-sdk commit `25139c5aa71c23990f0792d3e9248f6af858460b` on 2026-11-19, for testnet-10 lineage `4d10952e…`, deployed on
2026-11-12.

## Install

```bash
npm pkg set type=module   # a new project, after npm init -y
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e @knsdomains/sdk-tx@0.1.0-tn10.4d10952e
```

| Package              | What it is                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `@knsdomains/sdk`    | the read client: names to addresses, addresses to names, prices, listings. No key, no wasm |
| `@knsdomains/sdk-tx` | the write client: register, transfer, list, buy, through your wallet's signer              |
| `@knsdomains/wasm`   | the KNS contract module `@knsdomains/sdk-tx` runs, 9.0.1-src.f785b05; installed with it     |

- Node 22.12 or later, or a browser through a bundler. The packages are ES modules: `"type": "module"`, or `.mjs`.
- Reads only (send to a name, show names): `@knsdomains/sdk` alone.
- The Vite 6 and 7 dev servers need `optimizeDeps: { exclude: ['@knsdomains/wasm'] }` in `vite.config`, or `load()`
  fails with a `CompileError` that says _expected magic word_. Vite 8 needs nothing, and the line does no harm there.
- A Chrome extension on Manifest V3 adds `'wasm-unsafe-eval'` to its `content_security_policy`
  ([guide, section 3](wallet-integration.md#a-chrome-extension-manifest-v3)).
- No access to the npm registry: KNS can send the three package files instead
  ([guide, Getting the packages](wallet-integration.md#getting-the-packages)).

Check the install against the live tracker. It reads, needs no key and no node, and prints `true true`:

```bash
node --input-type=module -e "import { Kns } from '@knsdomains/sdk'; const s = await new Kns({ network: 'testnet-10' }).status(); console.log(s.sameRegistry, s.caughtUp)"
```

## What to read

| Page                                                                                 | What it is                                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [quickstart.md](quickstart.md)                                                       | each task as one short recipe: setup, send, show, check, register, sell, buy |
| [wallet-integration.md](wallet-integration.md)                                       | the full guide: every step, what to show, errors, nodes, safety, a test plan |
| [wallet-signing.md](wallet-signing.md)                                               | the signature hash, for a signer that recomputes it before it signs          |
| [api/sdk.md](api/sdk.md), [api/sdk-tx.md](api/sdk-tx.md), [api/wasm.md](api/wasm.md) | the package READMEs: the reference for every call                            |
| [examples/wallet](examples/wallet/README.md)                                         | the recipes as scripts, a marketplace script, and a Manifest V3 extension    |
| [examples/walkthrough.html](examples/walkthrough.html)                               | every write as code, in a page that runs nothing                             |
| [CHANGELOG.md](CHANGELOG.md)                                                         | what changed in each release                                                 |

A marketplace reads [section 6.7 of the guide](wallet-integration.md#67-marketplace) and
[`examples/wallet/marketplace.mjs`](examples/wallet/marketplace.mjs): listings, the partner fee a marketplace writes
into the listings it makes, list, cancel and buy. The partner fee is live on this lineage.

## Where it connects

| What        | Where                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracker     | <https://gap-tn10.knsdomains.org>, built into the packages: the index they read. Its `/health` has `manifest_digest`                                                                        |
| Site        | <https://covenant-tn10.knsdomains.org>, KNS's own app on the same lineage: register, list and buy by hand, and see what your integration did                                                        |
| Kaspa node  | for writes and for proving reads, with `--utxoindex`: a public testnet-10 node from the resolvers in `examples/wallet/public-node.mjs` (guide, section 8), or your own |
| Testnet KAS | the faucet at <https://faucet-tn10.kaspanet.io>, which asks for a human check in a browser. A five-character name needs 37 KAS; ask KNS when the faucet gives less      |

Testnet only. Never use a key that holds mainnet funds.

## When the lineage changes

testnet-10 is redeployed from time to time as a new lineage, and every contract address moves with it. This release
carries one lineage, `4d10952e…` (manifest digest `d3d3fb276efcda6b47bfffbfc42eb8687fe846474d7589b0d9e8ec6bb4bd1f1e`), and refuses any other:

- When the tracker serves another lineage, `await kns.status()` answers `sameRegistry: false`, and every call that
  reads the tracker throws `RegistryMismatchError`. Turn name features off, say an update is needed, and keep sending
  to plain addresses, which is not affected.
- KNS then publishes a new version of the packages, named for the new lineage (`0.1.0-tn10.<anchor8>`), under the
  dist-tag `tn10`: `npm install --save-exact @knsdomains/sdk@tn10 @knsdomains/sdk-tx@tn10`.
- There is no mainnet deployment yet. The packages refuse `network: 'mainnet'` rather than answer from a testnet.

## Contact

- Questions, testnet KAS: `<CONTACT_EMAIL>`
- A vulnerability: `<SECURITY_EMAIL>`, privately ([SECURITY.md](SECURITY.md))
- License: MIT ([LICENSE](LICENSE))
