# Wallet examples

The code of the [wallet integration guide](../../wallet-integration.md), as files that run. Every script here
was run on testnet-10 through public nodes, from the three packages installed into a fresh project. Of
`marketplace.mjs`, `browse` was run that way; its writes are the calls the packages' live test sold a name with.

| File               | What it is                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `signer.mjs`       | a `KnsSigner` over a key the wallet holds, Schnorr or ECDSA; it recomputes every hash before it signs                   |
| `sighash.mjs`      | Kaspa's signature hash from the Safe JSON a signer is handed ([Signing KNS transactions](../../wallet-signing.md)) |
| `public-node.mjs`  | a testnet-10 node from the Kaspa public node network                                                                    |
| `send-to-name.mjs` | a recipient field and an account screen: levels 1 and 2, reads only                                                     |
| `manage-names.mjs` | every write: probe, register, primary, transfer, profile, list, cancel, buy, subdomain                                  |
| `marketplace.mjs`  | browse listings (a marketplace's own, by price or listing time), list with a partner fee, cancel, buy                   |
| `extension/`       | a Chrome extension (Manifest V3) that resolves names in its popup and loads the module in its service worker            |

## Running them

The scripts import the packages by name, and Node looks for a package from the script's own folder upward. So they
run inside a project where the packages are installed, not where they sit in these docs. Make one as in the guide's
[Getting the packages](../../wallet-integration.md#getting-the-packages), add the two libraries the signer
imports, and copy the examples into it:

```bash
mkdir my-app && cd my-app && npm init -y && npm pkg set type=module
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e @knsdomains/sdk-tx@0.1.0-tn10.4d10952e
npm install @noble/curves@2 @noble/hashes@2   # signer.mjs and sighash.mjs import them
cp -R <these docs>/examples ./examples
node examples/wallet/send-to-name.mjs alice.kas
node examples/wallet/send-to-name.mjs alice.kas --prove    # also checks the answer against a public node
```

Run from the docs' own folder, a script stops with `ERR_MODULE_NOT_FOUND` for `@knsdomains/sdk`.

The writes need a testnet key with some testnet KAS. Each command prints what the wallet would be asked to sign, and
signs and sends only with `--yes`:

```bash
export KNS_KEY=<64 hex>                   # a testnet key; KNS_SCHEME=ecdsa for an ECDSA account
node examples/wallet/manage-names.mjs probe
node examples/wallet/manage-names.mjs register wallettest123.kas --yes
node examples/wallet/manage-names.mjs primary wallettest123.kas --yes
node examples/wallet/manage-names.mjs profile wallettest123.kas My Display Name --yes
node examples/wallet/manage-names.mjs transfer wallettest123.kas kaspatest:qr… --yes
node examples/wallet/manage-names.mjs list wallettest123.kas 1.5 --yes
node examples/wallet/manage-names.mjs cancel wallettest123.kas --yes
node examples/wallet/manage-names.mjs buy somename.kas 1.5 --yes   # from another account
node examples/wallet/manage-names.mjs subdomain wallettest123.kas pay kaspatest:qr… --yes
```

`marketplace.mjs` is the marketplace of the guide's [section 6.7](../../wallet-integration.md#67-marketplace):
it prints what the seller, the buyer and the partner each get. Testnet-10 lineage `4d10952e…` runs the partner fee:
`browse` reads its tracker, and its writes are the calls the packages' live test sold a name with, a 10% fee paid to
the partner at output 3. Without `--yes` they print the plan and send nothing.

```bash
node examples/wallet/marketplace.mjs browse --sort listed_newest
node examples/wallet/marketplace.mjs browse kaspatest:qr… --sort price_asc      # one marketplace's listings
node examples/wallet/marketplace.mjs list wallettest123.kas 25 kaspatest:qr… 250 --yes   # 2.5% to the partner
node examples/wallet/marketplace.mjs buy wallettest123.kas 25 --yes             # from another account
```

Never use a key that holds mainnet funds, and never put one in a page: these scripts are for Node.

## The extension

```bash
cp -R <these docs>/examples/wallet/extension my-extension && cd my-extension
npm init -y && npm pkg set type=module
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e @knsdomains/sdk-tx@0.1.0-tn10.4d10952e vite@6
npx vite build
```

Load `dist/` at `chrome://extensions` with "Load unpacked". The popup resolves what you type and loads the module on
demand; the service worker loads it at install. `public/manifest.json` carries the one line Manifest V3 needs for
WebAssembly, `'wasm-unsafe-eval'`.
