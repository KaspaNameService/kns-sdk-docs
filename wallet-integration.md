# Integrating KNS into a wallet

In a hurry? The [quickstart](quickstart.md) has each task as a short recipe; this guide is the full path.

This guide is for teams that build a Kaspa wallet: a browser extension, a web, desktop or mobile app, or a
custodial service. It covers three things your users can do with `.kas` names: send to a name instead of an
address, see names where they would see addresses, and register and manage names without leaving the wallet. It
takes them in the order most wallets ship them, and says at each step what your interface has to show.

Every code sample here was run against the live testnet-10 deployment, from packages installed into a fresh
project, through a public node, with a signer written the way a wallet writes one. The runnable versions are in
[`examples/wallet`](examples/wallet). The package READMEs are the reference for every call: this guide is the
path through them.

| Package              | What it does                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `@knsdomains/sdk`    | Reads the registry: names to addresses, addresses to names, availability, prices, profiles  |
| `@knsdomains/sdk-tx` | Builds every KNS transaction, has your wallet sign it, sends it and follows it              |
| `@knsdomains/wasm`   | The KNS module `@knsdomains/sdk-tx` runs: the contract compiler and the transaction builder |

Measured in a Vite build: a page that only reads ships 109 KB of JavaScript (47 KB gzipped). One that also writes,
with the signer of section 6.2, ships 238 KB (83 KB gzipped), plus the module, 8.9 MB (3.9 MB gzipped).

1. [What you can add](#1-what-you-can-add)
2. [Before you start](#2-before-you-start)
3. [Install and load](#3-install-and-load)
4. [Send to a name](#4-send-to-a-name)
5. [Show names](#5-show-names)
6. [Manage names](#6-manage-names)
7. [Errors](#7-errors)
8. [Nodes](#8-nodes)
9. [Safety checklist](#9-safety-checklist)
10. [Testing your integration](#10-testing-your-integration)
11. [Keeping up with deployments](#11-keeping-up-with-deployments)

## 1. What you can add

| Level             | Your user can                                                                                                             | You need                                                               | Your wallet signs   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| 1. Send to a name | type `alice.kas` into the recipient field and pay whoever holds it                                                        | `@knsdomains/sdk`                                                      | an ordinary payment |
| 2. Show names     | see `alice.kas` instead of `kaspa:qr…` on accounts, contacts and history; browse their names                              | `@knsdomains/sdk`                                                      | nothing             |
| 3. Manage names   | register a name, transfer it, choose the name shown for their address, edit its profile, sell or buy one, mint subdomains | the three packages, a Kaspa node, and a signer you write (section 6.2) | KNS transactions    |

Levels 1 and 2 need no key, no wasm module and no node. Ship them first.

## 2. Before you start

### Networks and deployments

KNS runs on Kaspa **testnet-10** today. There is no mainnet deployment yet, so the packages have no mainnet entry:
a client asked for mainnet refuses instead of answering from a testnet. A mainnet release will add it, and your code
will pass `network: 'mainnet'`.

A deployment is called a lineage and is identified by its anchor id. A testnet lineage is replaced from time to
time, and every contract address moves with it. So each build of the packages carries exactly one lineage per
network, and its version says which: `0.1.0-tn10.4d10952e` is built for testnet-10 lineage `4d10952e…`. A build
that meets a tracker serving another lineage refuses with `RegistryMismatchError` rather than give answers about
addresses nothing holds. [Section 11](#11-keeping-up-with-deployments) says what to do when that happens.

### What the packages connect to

- **The KNS tracker**, an index of the registry at `https://gap-tn10.knsdomains.org`. It is built in, and it answers
  HTTPS with `Access-Control-Allow-Origin: *`, so a page or an extension reaches it without extra permissions. It is
  what makes a name resolve in one request. You do not have to trust it: with a node, every answer is proven
  against the chain ([section 4](#proving-answers-against-the-chain)).
- **A Kaspa node**, for level 3, and optionally to prove answers at levels 1 and 2. A public node works
  ([section 8](#8-nodes)).

### Getting the packages

The packages are on the npm registry, under the scope `@knsdomains`. Install the two clients, at the version built for
the lineage the tracker serves:

```bash
npm pkg set type=module   # a new project, after npm init -y
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e @knsdomains/sdk-tx@0.1.0-tn10.4d10952e
```

- **Your code imports them as ES modules**, and the samples here use top-level `await`, which only a module has. A
  new project sets `"type": "module"` as above, or names its files `.mjs`. A bundler's project already is one.
- **`@knsdomains/wasm` comes with `@knsdomains/sdk-tx`**, which depends on the exact version it was tested with, and
  needs `@knsdomains/sdk` 0.1 beside it. Your code imports `@knsdomains/wasm` to load it, which npm allows because it
  installs it beside the other two; under pnpm or Yarn Plug'n'Play add it to your own dependencies, at the version
  `@knsdomains/sdk-tx` names.
- **The version names the lineage** (`0.1.0-tn10.4d10952e` is built for testnet-10 lineage `4d10952e…`), and the
  dist-tag `tn10` points at the newest testnet-10 build: `npm view @knsdomains/sdk dist-tags`. Update the two together
  ([section 11](#11-keeping-up-with-deployments)).
- **`--save-exact`** writes the exact version into `package.json`. The versions of two lineages do not sort by date
  (`0.1.0-tn10.<anchor8>` compares the anchors as text), so a range such as `^0.1.0-tn10.4d10952e` could take another
  lineage's build on the next `npm update`.
- **Reads only?** Levels 1 and 2 need `@knsdomains/sdk` alone.
- **No access to the npm registry**, as in some CI or air-gapped builds: KNS can send the three package files
  (`knsdomains-wasm-9.0.1-src.f785b05.tgz`, `knsdomains-sdk-0.1.0-tn10.4d10952e.tgz`,
  `knsdomains-sdk-tx-0.1.0-tn10.4d10952e.tgz`). Keep them in a committed `vendor/` folder and install all three in
  one command, `npm install ./vendor/<file>…`, or npm looks on the registry for the one left out.

A wallet that signs with its own key code, as in section 6.2, also installs the two libraries the samples use (tested
with 2.4.0 of each; the ECDSA call is the 2.x API), or uses the secp256k1 and BLAKE2b code it already has:

```bash
npm install @noble/curves@2 @noble/hashes@2
```

### Where it runs

| Runtime                       | Status                                 | How                                                                                                                                |
| ----------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Node 22.12 or later           | tested on 22.12 and 24.2               | `loadNode()` from `@knsdomains/wasm/node`                                                                                          |
| A web page, through a bundler | tested with Vite 6 and 8 in Chromium   | `load()`; the bundler emits the `.wasm` as an asset; the Vite 6 and 7 dev servers need one line ([section 3](#3-install-and-load)) |
| Chrome extension, Manifest V3 | tested in a popup and a service worker | `load()`, and one line in the manifest ([section 3](#a-chrome-extension-manifest-v3))                                              |
| Electron, Tauri               | not tested                             | as a web page                                                                                                                      |
| React Native on Hermes        | levels 1 and 2 only, not tested        | Hermes has no WebAssembly, so `@knsdomains/wasm` cannot run there                                                                  |

Amounts are in sompi (1 KAS = 100,000,000 sompi). Every amount the packages compute or read from the tracker is a
`bigint`: `quote`, `feeSompi`, `spendsSompi`, `priceSompi`, `listedPriceSompi`. The module's own answers, the
snake_case fields of a call's `result` and of `status().constants`, are plain numbers. `formatKas` and `parseKas`
from `@knsdomains/sdk` convert.

## 3. Install and load

`@knsdomains/sdk` needs no setup. `@knsdomains/sdk-tx` needs the module loaded once:

```ts
// Under Node: reads the .wasm from the package on disk.
import { loadNode } from '@knsdomains/wasm/node'

const wasm = await loadNode()
```

```ts
// In a page or an extension, through a bundler.
import { load } from '@knsdomains/wasm'

const wasm = await load()
wasm.api_version() // 'kns-wasm-api-v9'
```

`load()` fetches the `.wasm` file next to the package's entry, `new URL('./vendor/kns_wasm_bg.wasm', import.meta.url)`.
`vite build` turns that into an asset of your build with no configuration; other bundlers that understand
`new URL(…, import.meta.url)` do the same. The dev servers of Vite 6 and 7 (`vite`) need one line: they pre-bundle
dependencies into `node_modules/.vite/deps`, where that URL answers the HTML page instead of the `.wasm`, and `load()`
then fails with a `CompileError` that says _expected magic word_. Leave `@knsdomains/wasm` out of the pre-bundling. The
Vite 8 dev server needs nothing, and the line does no harm there:

```js
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: { exclude: ['@knsdomains/wasm'] }, // Vite 6 and 7 dev server: load the module from its own package folder
})
```

If your bundler does not understand `new URL(…, import.meta.url)`, copy `@knsdomains/wasm/kns_wasm_bg.wasm` into your
build and pass its URL, or its bytes, or a compiled `WebAssembly.Module`: `load(url)`. Serve it as `application/wasm`.

The module is 8.9 MB (3.9 MB gzipped). Load it when the user opens a name-management screen, not when the wallet
starts. One instance serves the whole app; calling `load()` again answers the same one. A load that fails (a fetch
cut off, say) is not kept: call `load()` again to retry.

### A Chrome extension (Manifest V3)

Manifest V3 does not let an extension compile WebAssembly unless it asks to. Without the line below, `load()` fails
in the popup and in the service worker with _"Compiling or instantiating WebAssembly module violates the following
Content Security policy directive"_. Add to `manifest.json`:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

With it, the popup (or any extension page) and the background service worker both load the module, reach the
tracker and a node, and sign. That was tested on Chromium with the extension in
[`examples/wallet/extension`](examples/wallet/extension). Import the packages statically in a service worker: a
service worker cannot use `import()`. The tracker needs no `host_permissions`, and nodes are reached over
WebSocket, which needs none either.

## 4. Send to a name

One call answers a recipient field. `recipientFor` takes whatever the user typed (a name, a subdomain or an
address) and answers the address to pay, or why there is none. It never throws on the input itself.

```ts
import { Kns, type Recipient } from '@knsdomains/sdk'

const kns = new Kns({ network: 'testnet-10' })

interface RecipientView {
  readonly payTo: string | null // the address the payment goes to, or null: do not offer to pay
  readonly title: string // what the field shows
  readonly notes: readonly string[] // shown beside it, before the amount
}

async function recipientView(input: string): Promise<RecipientView> {
  const r: Recipient = await kns.recipientFor(input)
  if (r.kind === 'neither') return { payTo: null, title: 'Not a .kas name or a Kaspa address', notes: [] } // log r.reason
  const notes: string[] = []
  if (r.ownerType === 'p2sh') notes.push('This address is a multisig or another script.')
  if (r.kind === 'address') return { payTo: r.address, title: r.address, notes }
  if (r.address === null) return { payTo: null, title: faultText(r.fault), notes }
  if (r.resolved?.shown.nonAscii)
    notes.push('This name has characters outside a-z, 0-9 and -. Check it is the one you mean.')
  if (r.listed) notes.push('This name is for sale. Its seller receives this payment until somebody buys it.')
  notes.push('Names can change hands. Check the address before you send.')
  return { payTo: r.address, title: `${r.name} → ${r.address}`, notes }
}

function faultText(fault: string | undefined): string {
  switch (fault) {
    case 'in-covenant':
      return 'A contract holds this name, and a contract has no address to pay.'
    case 'withheld':
      return 'This name breaks the naming rules, so it never resolves.'
    case 'moved':
      return 'This name moved to a newer version of the registry.'
    case 'not-ready':
      return 'The name service is catching up. Try again in a moment.'
    default:
      return 'Nobody holds this name, or the name service cannot describe it yet.'
  }
}
```

What the answer means:

| `kind`                | What the user typed                     | `address`                                                       |
| --------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `address`             | a Kaspa address on this network         | the address itself; `ownerType` is `schnorr`, `ecdsa` or `p2sh` |
| `domain`, `subdomain` | a name; `name` is its standard spelling | the holder's address, or `null` with a `fault`                  |
| `neither`             | neither; `reason` says why, for a log   | absent                                                          |

| `fault`       | When                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| `unresolved`  | no record: the name is free, or registered and not yet described, or the tracker is behind |
| `in-covenant` | a contract holds the name, and a contract has no address                                   |
| `withheld`    | the recorded spelling breaks the naming rules: the name is shown, never resolved           |
| `moved`       | the name moved to a successor registry through a dual-signed move                          |
| `not-ready`   | the tracker is not ready to answer safely                                                  |

Rules for the send screen:

1. **Show `name`, the standard spelling, and the address.** Never what was typed: `Alice.KAS` and ` alice.kas` are
   `alice.kas`.
2. **Never fall back.** When a name does not resolve, say so and stop. Do not pay a similar name, a cached owner or
   the raw input.
3. **Resolve again right before you sign the payment.** A name can change hands between typing and sending, and the
   package caches nothing.
4. **Pay `address` and nothing else.** Not an address from the name's profile, which is the holder's own unverified
   entry, and not an owner field from the API: a contract holder has no address.
5. **Debounce while the user types.** Every call that is not answered locally reaches the tracker.
6. **Write your own words for the user.** `reason` and every error `message` are English text for developers: they can
   carry Markdown backticks and Unicode direction marks. Log them, and show your interface's own message.

### Proving answers against the chain

Give the client a node, and every record is checked against the chain before you see it. `proven` turns from `null`
to `true`, and an answer the chain contradicts throws `RefutedError` instead of reaching your screen:

```ts
import { Kns, WrpcJson, fromWrpc } from '@knsdomains/sdk'

const rpc = await WrpcJson.connect('wss://node.example/kaspa/testnet-10/wrpc/json')
const kns = new Kns({ network: 'testnet-10', node: fromWrpc(rpc, { network: 'testnet-10' }) })
const r = await kns.recipientFor('alice.kas')
if (r.kind === 'domain' || r.kind === 'subdomain') show(r.proven) // true once the chain confirms the record
```

The node needs `--utxoindex` and a JSON wRPC endpoint. A public node works; see [section 8](#8-nodes).

## 5. Show names

### The name for an address

Accounts, contacts and transaction history show the name the holder of an address chose to show, or the address:

```ts
const p = await kns.primaryNameFor(address)
const label = p.name ?? address // no chosen name: show the address

const many = await kns.primaryNamesFor(addresses) // one answer per address, in order
```

A holder chooses by setting a name's primary flag, a transaction (section 6.4). There is no fallback to some other
name the address holds. The flag goes when the name is transferred to someone else or sold, so cache an answer for
minutes, not days.

### The names an account holds

```ts
let cursor: string | undefined
do {
  const page = await kns.namesOf(address, { limit: 50, cursor })
  for (const record of page.domains) {
    const shown = kns.display(record) // { text, kind, nonAscii, legacy, hash }
    show(shown.text, shown.nonAscii ? 'non-ASCII' : '', shown.legacy ? 'migrated from the old registry' : '')
  }
  cursor = page.next_cursor
} while (cursor)
```

`display` shows a name only when it hashes to the record, and a shortened hash such as `3c6c3b18…e172` otherwise.
Use it for every name that did not come from the user's own typing.

### A name's details and profile

```ts
import { isRenderableUrl, sanitizeText } from '@knsdomains/sdk'

const resolved = await kns.resolveName('alice.kas') // holder, ownerType, listed price, primary flag, outpoint
const p = await kns.profileOf('alice.kas')
if (p.kind === 'verified') {
  const profile = p.profile as { display?: string; bio?: string; links?: Record<string, string> }
  show(sanitizeText(profile.display ?? ''), sanitizeText(profile.bio ?? ''))
  for (const [site, url] of Object.entries(profile.links ?? {})) if (isRenderableUrl(url)) show(site, url)
  if (p.nameMatches === false) show('This profile was written for another name.')
}
const events = await kns.history('alice.kas', { order: 'desc', limit: 20 }) // registered, transferred, listed, …
```

A profile is a JSON document whose SHA-256 is the name's on-chain `metadata`. `profileOf` answers `verified` only
when the bytes match. Everything in it is the holder's own entry:

- Run every string through `sanitizeText`, which strips the direction and zero-width characters a profile can carry
  and a name cannot. Check every link with `isRenderableUrl`, which refuses `javascript:` and the like.
- Show `addresses` as "entered by the holder, not verified". **Never pay an address from a profile.** A profile
  survives a transfer, and anyone can type anything into one.
- `nameMatches: false` means the profile names another domain: someone may have copied it to borrow its look.
- A transfer keeps the profile unless the sender clears it, so a profile can come from a previous holder. When its
  `owner` is not the current holder's key, say it was written by a previous holder. Compare it with
  `resolved.record.owner_pubkey`, the holder's x coordinate: for an ECDSA `owner`, its last 64 hex characters.
- `withheld` means the operator stopped serving that profile. Nothing changed on chain.

## 6. Manage names

Level 3 adds `@knsdomains/sdk-tx`. It reads a name's state from the tracker, has the module confirm it on the node,
checks the product rules while nothing is signed, and only then asks your signer to sign. The module verifies every
signature that comes back against its own hash before anything is sent.

### 6.1 The client

```ts
import { Kns } from '@knsdomains/sdk'
import { load } from '@knsdomains/wasm' // under Node: import { loadNode } from '@knsdomains/wasm/node'
import { KnsTx } from '@knsdomains/sdk-tx'

const kns = new Kns({ network: 'testnet-10' })
const tx = new KnsTx({
  kns,
  wasm: await load(), // under Node: await loadNode()
  nodeUrl: 'wss://node.example/kaspa/testnet-10/wrpc/borsh', // Borsh wRPC; wss:// from an https page
  signer, // your KnsSigner: section 6.2
})
await tx.status() // the module accepts this build's deployment, or refuses here
```

One `KnsTx` per account. A dApp that asks KasWare or Kastle to sign uses `kaswareSigner` or `kastleSigner` from
`@knsdomains/sdk-tx` instead of writing one ([the package README](api/sdk-tx.md#signers)).

### 6.2 Your signer

Your wallet holds the keys, so it implements `KnsSigner`. The package hands it a finished transaction and the
inputs to sign; it signs them and hands the transaction back:

```ts
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js'
import { type Owner, OwnerScheme, fromHex, ownerAddress, ownerFromEcdsaKey, toHex } from '@knsdomains/sdk'
import { type KnsSigner, type SignInput, assertSignableDocument } from '@knsdomains/sdk-tx'

function keySigner(privateKey: Uint8Array, scheme: 'schnorr' | 'ecdsa'): KnsSigner {
  const compressed = secp256k1.getPublicKey(privateKey, true)
  const owner: Owner =
    scheme === 'schnorr'
      ? { scheme: OwnerScheme.Schnorr, bytes: schnorr.getPublicKey(privateKey) }
      : ownerFromEcdsaKey(compressed)
  const address = ownerAddress(owner, 'kaspatest')
  if (!address) throw new Error('this key has no address')
  return {
    id: 'my-wallet',
    name: 'My Wallet',
    network: 'testnet-10',
    address,
    owner,
    ownerScheme: scheme,
    ownerPubkey: scheme === 'schnorr' ? toHex(owner.bytes) : toHex(compressed), // 64 hex, or 66 for ECDSA
    sign(safeJson: string, signInputs: SignInput[]): Promise<string> {
      const doc = assertSignableDocument(
        safeJson,
        signInputs.map((s) => s.index),
        'My Wallet'
      ) as { inputs: { signatureScript?: string }[] }
      for (const input of signInputs) {
        if (input.sighashType !== 1) throw new Error(`refusing sighash type ${input.sighashType}`)
        if (input.scheme !== scheme) throw new Error(`asked for ${input.scheme} from a ${scheme} account`)
        const hash = fromHex(input.sighash, 'sighash')
        const signature =
          scheme === 'schnorr'
            ? schnorr.sign(hash, privateKey)
            : secp256k1.sign(hash, privateKey, { prehash: false, lowS: true, format: 'compact' })
        doc.inputs[input.index]!.signatureScript = `41${toHex(signature)}01`
      }
      return Promise.resolve(JSON.stringify(doc))
    },
  }
}
```

The contract, in full:

- `sign(safeJson, signInputs)` is called once per transaction, when it is time to sign. `safeJson` is the frozen
  transaction in kaspa-wasm Safe JSON. Each entry of `signInputs` names an input `index`, its `sighashType` (always
  1, SIGHASH_ALL), the account's `scheme`, and `sighash`, the 32-byte hash that input needs signed, in hex.
- Sign each `sighash` with the account's key. Schnorr is BIP-340, 64 bytes. ECDSA is a 64-byte compact signature
  with a low S, over the hash as given (`prehash: false`): for an ECDSA account, `sighash` already is Kaspa's ECDSA
  signature hash. A high-S ECDSA signature is refused.
- Write `41 ‖ signature ‖ 01`, 132 hex characters, into that input's `signatureScript`. Change nothing else, and
  answer the whole document as a string. Only those 64 bytes are read back.
- Sign only the inputs named, refuse any other sighash type, and never broadcast: the module sends, after it has
  verified every signature against its own hash and the account's key.
- A registration or a buy asks only for your coins. Every spend of a name you hold also asks for one input that is
  not at your address: the name's own covenant output (a listing's, for a cancel; the parent's, for a subdomain
  mint). Your signature on it is what the contract checks to know the holder agreed. Kaspa's signature hash commits
  to the spent output's script public key, never to a redeem script, so the wallet does not need to understand the
  contract. A wallet that will only sign inputs at its own address cannot manage names, and `probeSigner` tells you
  so.
- `ownerPubkey` is the x-only key (64 hex) for a Schnorr account and the compressed key (66 hex) for an ECDSA one.
  `network` must be the client's network; `KnsTx` refuses a signer bound to another.
- `signMessage` is optional and nothing in this guide needs it.

**Sign only what you hashed yourself.** A careful wallet recomputes each signature hash from `safeJson` and refuses
to sign when it differs from `sighash`. [Signing KNS transactions](wallet-signing.md) writes the preimage out,
including what a covenant-era (version 1) transaction adds to it, and
[`examples/wallet/sighash.mjs`](examples/wallet/sighash.mjs) implements it: it gives the module's hash for every
kind of KNS transaction, and the example signer checks every input with it before signing.

**Where the confirmation goes.** Show the user what they are about to do before you call `registerName` or
`submit` (sections 6.3 and 6.4): that is where the package has the name, the amounts and the recipient. Inside
`sign`, unlock the key as your wallet always does, and sign.

**Ask the wallet once.** `probeSigner` hands your signer a real registry input it does not own and a coin of its
own, and checks both signatures. It broadcasts nothing. The account must hold at least one coin.

```ts
const verdict = await tx.probeSigner()
// verdict.verdict: 'ready: the wallet signs foreign P2SH inputs and its sighash matches ours'
// verdict.will_sign_foreign_p2sh, verdict.sighash_agrees_on_own_input, verdict.broadcast === false
```

Run it in your test suite against testnet, and again after any change to your signing code.

A script under Node that holds a key can pass `privateKey` instead of a signer, and the module signs inside: the
32-byte secret key as 64 hex characters, with `privateKeyScheme` saying which owner it acts as, `'schnorr'` (the
default) or `'ecdsa'`. The package refuses that option wherever a `window` exists. A wallet keeps its keys in its
keyring and uses a signer.

### 6.3 Register a name

```ts
import { formatKas } from '@knsdomains/sdk'

const q = kns.quote('alice.kas')
show(`Fee ${formatKas(q.feeSompi)} KAS. ${formatKas(q.lockedSompi)} KAS stays locked with the name.`)
show(`Your wallet needs ${formatKas(q.totalToFund)} KAS.`)
if (!(await kns.available('alice.kas'))) show('This name is taken.')

// The user confirms; then:
const done = await tx.registerName('alice.kas', {
  onProgress: (p) => show(p.phase), // checking → signing (your signer, once) → broadcasting → done
})
show(done.txid, formatKas(done.feeSompi), done.warnings) // warnings: empty for a key holder
await tx.waitForIndex('alice.kas', done.txid) // the tracker shows the name a few seconds later
```

A registration is one transaction and one call to your signer. Before it asks, `registerName` checks that open
registration has started, that the name is free (code `taken` if not) and that the module spells the name the same
way. `broadcasting` means your signer has answered, not that anything was sent: the module still checks the
signatures, and a refusal there sends nothing. The name is registered at `done`. In the test runs on testnet-10,
`done` came 8 to 10 seconds after the call, and the tracker showed the name 6 to 28 seconds later.

`waitForIndex` asks the tracker every 1.5 seconds for up to 2 minutes (`timeoutMs`, `intervalMs`), then throws a
`KnsTxError` with code `unknown` and the message "the tracker did not show … in time". That does not mean the
transaction failed: the tracker is behind, so look again later.

What it costs. Read every figure from `quote`; the table is testnet-10's schedule:

| Root label length (code points) | Fee       |
| ------------------------------- | --------- |
| 1 or 2                          | 4,200 KAS |
| 3                               | 2,100 KAS |
| 4                               | 525 KAS   |
| 5 or more                       | 35 KAS    |

- **Length is in Unicode code points** of the standard spelling: `台北.kas` is 2, and so is a flag emoji. Say "3
  characters" only in that sense.
- **1.8 KAS stays locked with the name** (`lockedSompi`): three deposits of 0.6 KAS in the name's covenant outputs.
  They move with the name when it is transferred or sold. Nothing returns them today.
- **The wallet must hold `totalToFund`**: the fee, the 1.8 KAS, and a 0.2 KAS allowance for the network fee (about
  0.02 KAS). What the fee leaves of the allowance comes back as change only when the change is over 0.2 KAS, so
  fund a little more than `totalToFund`.
- **Whoever's registration is accepted first holds the name.** The protocol accepts front-running. `available`
  asks the tracker by a prefix of the name's hash, so the tracker does not learn which name you check, but a
  registration is public once it is broadcast.

### 6.4 Spend a name: plan, confirm, submit

Every spend of a name the account holds is two steps. A `plan…` call reads the name's current state, has the
module confirm it on the node, checks the rules and answers what the wallet will be asked, with nothing signed.
`submit` runs it.

```ts
import { formatKas } from '@knsdomains/sdk'

const plan = await tx.planTransfer('alice.kas', to)
show(plan.summary) // 'send alice.kas to kaspatest:qr…'
if (plan.recipient?.warn) show('The recipient is a multisig or a contract.') // then ask again
if (plan.spendsSompi > 0n) show(`You pay ${formatKas(plan.spendsSompi)} KAS beyond the network fee.`)

// The user confirms; then:
const result = await tx.submit(plan)
if (result.warnings.length) show(result.warnings) // the module's text for a multisig or contract holder
await tx.waitForIndex(plan.name, result.txid)
```

Build the plan right before the confirmation screen: a plan whose name has changed state since is refused by the
module. The one-step calls (`tx.transfer`, `tx.list`, …) are a plan and a submit in a row, for screens that show
nothing in between.

| Plan                                             | What happens                                                                                                                                                                                   | The wallet pays, beyond the network fee |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `planTransfer(name, to, { profile })`            | `to` holds the name. The profile is kept (`'keep'`, the default), cleared (`'clear'`) or replaced (a CID); ask the sender which. The primary flag stays only for a transfer to yourself.       | nothing                                 |
| `planUpdateProfile(name, cid \| null)`           | the name points at another profile, or at none                                                                                                                                                 | nothing                                 |
| `planSetPrimary(name)`, `planClearPrimary(name)` | the name is, or stops being, the one shown for the holder's address                                                                                                                            | nothing                                 |
| `planList(name, priceSompi, { partnerFee })`     | the name is for sale, held by a listing contract; at least 0.2 KAS. `partnerFee` writes a marketplace's fee into the listing ([section 6.7](#67-marketplace)). Cancel before any other change. | nothing                                 |
| `planCancel(name)`                               | the listing is withdrawn                                                                                                                                                                       | nothing                                 |
| `planBuy(name, { expectedPriceSompi })`          | the buyer holds the name. Refused before signing if the price is not the one the buyer saw. A partner fee is paid out of the price. The profile and the primary flag are cleared.              | the price                               |
| `planMintSubdomain(parent, label, to)`           | `label.parent` exists and `to` holds it, for good. Refused before the plan if it exists (`taken`).                                                                                             | 1.8 KAS of deposits and the 1 KAS fee   |

The network fee of a spend is about 0.013 to 0.016 KAS, and 0.03 KAS for a subdomain. It always comes from the wallet,
never from the name's deposits. A recipient is an address: bare hex is refused, because a key and a multisig's script
hash look the same.

When a name goes to a multisig or a contract, `plan.recipient.warn` is true and the result's `warnings` carries the
module's text. Show that text as it is. In short: a multisig that holds a name must only ever sign with
SIGHASH_ALL, and a contract holder needs its own rules to keep the name safe.

### 6.5 Write a profile

A profile is canonical JSON whose SHA-256 goes on chain. Writing one is: build it, serialize it canonically, skip
the transaction if nothing changed, pin the bytes, then point the name at them.

```ts
import { toHex } from '@knsdomains/sdk'

/** Drop every empty field at every level: '', null, undefined, and an object left with nothing in it. */
function pruned(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    const p = pruned(v)
    if (p === undefined || p === null || p === '') continue
    if (typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0) continue
    out[k] = p
  }
  return out
}

/** JSON with the keys of every object sorted and no whitespace. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** A profile as canonical JSON bytes. */
function canonicalProfileBytes(profile: Record<string, unknown>) {
  return new TextEncoder().encode(canonicalJson(pruned(profile)))
}

const domain = await tx.domainOf('alice.kas', { notListed: true })
const bytes = canonicalProfileBytes({ v: 1, name: domain.name, owner: signer.ownerPubkey, display: 'Alice' })
const digest = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
if (digest !== domain.metadata) {
  const res = await fetch('https://gap-tn10.knsdomains.org/v1/pin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: bytes,
  })
  if (!res.ok) throw new Error(`pin refused: ${res.status}`) // 429 rate_limited, 451 content_withheld
  const pinned = (await res.json()) as { cid: string; metadata: string }
  if (!pinned.cid.startsWith('bafkrei') || pinned.metadata !== digest) throw new Error('the pin answered another file')
  const plan = await tx.planUpdateProfile('alice.kas', pinned.cid)
  const result = await tx.submit(plan) // after the user confirms
  await tx.waitForIndex('alice.kas', result.txid)
  const p = await kns.profileOf('alice.kas') // p.kind === 'verified'
}
```

The fields, all optional except `v`:

| Field                     | What it holds                                                                 |
| ------------------------- | ----------------------------------------------------------------------------- |
| `v`                       | `1`, required                                                                 |
| `name`                    | the name the profile is for; readers flag a profile written for another name  |
| `owner`                   | the holder's key: 64 hex (Schnorr) or 66 hex (ECDSA)                          |
| `display`, `bio`          | free text                                                                     |
| `avatar`, `banner`        | `ipfs://bafkrei…`, an image pinned the same way                               |
| `email`                   | published for good: anyone can read every old profile                         |
| `redirect`, `contenthash` | where the name's website is; readers offer these and never follow them        |
| `links`                   | site → URL                                                                    |
| `addresses`               | chain ticker → address, the holder's own entry, never verified and never paid |
| `records`                 | key → text, keys `[a-z0-9_]{1,32}`                                            |

Canonical means UTF-8, keys sorted at every level and matching `[a-z0-9_]{1,32}`, no whitespace, no escapes beyond
the ones JSON requires, integers only, no duplicate keys, and empty fields left out at every level, an object left
empty included (`"links":{}` is refused). The pin endpoint refuses anything else rather than fix it. Do not reach
for `JSON.stringify(profile, keys)`: a list of the top-level keys alone silently empties `links`, `addresses` and
`records`, and a list of every key keeps an empty field whose name is used elsewhere.

Pins are rationed, and past the ration the answer is `429 rate_limited`: 64 MiB a day for everyone, and 10 a minute
per caller. The public tracker sits behind a proxy whose address is the only one it sees, so today those 10 a
minute are shared by every caller, every wallet and every user together. Pin when the user saves, never while they
type, skip the pin when the digest is unchanged, and on a 429 tell the user to save again in a minute.

### 6.6 Names held by a multisig

A name an m-of-n multisig holds is spent through signing files: `tx.multisig(redeemScript)` builds one, the
co-signers add their signatures with `tx.signMultisig(file, key)` under Node, and `tx.finishMultisig(file)` sends it.
No browser wallet signs such a file today. [The package README](api/sdk-tx.md#multisig-owners) has
the round trip.

### 6.7 Marketplace

A listing is public on chain, so any wallet or marketplace can show it and fill it. A marketplace that wants a share
of a sale writes it into the listing itself: a **partner fee**, the address it is paid to and a rate in basis points
of the price (100 = 1%). The seller agrees to it by signing the listing. From then on the contract refuses every
purchase that does not pay it, whichever front end builds the purchase, so a fee one marketplace charges survives a
buyer who finds the listing through another.

Testnet-10 lineage `4d10952e…`, the one the packages carry, runs the partner fee. The packages' live test sells
through it: a name listed at 2 KAS with a 10% fee and bought from another account paid the seller 1.8 KAS at output 1
and the partner 0.2 KAS at output 3, in transaction `9aff0a6efbab8b42e1a5ea80fa7c8d5ec8701a6be60c133fc82edfef207fca54`.
The name was `sdk-live-mwmym9md.kas`: `kns.history` of it shows the sale, a `sold` event with the listing's
`listed_fee_*` fields, which is where to see them when no listing open on the tracker carries a fee.
`browse` in [`examples/wallet/marketplace.mjs`](examples/wallet/marketplace.mjs) reads the same tracker's listings.
[Section 11](#11-keeping-up-with-deployments) says how a new lineage reaches a wallet.

**Browse.** `kns.listings` is `/v1/domains` with `listed=true`: every name for sale, one marketplace's, or the ones
without a partner fee, in the order you ask for.

```ts
import { formatBps, formatKas } from '@knsdomains/sdk'

const page = await kns.listings({ sort: 'price_asc', limit: 50 }) // every listing, cheapest first
for (const r of page.domains) {
  const fee = r.listed_fee_bps ? `, ${formatBps(r.listed_fee_bps)} to ${r.listed_fee_to_address ?? ''}` : ''
  show(kns.display(r).text, `${formatKas(r.listed_price_sompi ?? 0n)} KAS${fee}`)
}
const ours = await kns.listings({ partner: address, sort: 'listed_newest' }) // the listings whose fee goes to `address`
const none = await kns.listings({ partner: 'none' }) // the listings without a partner fee
show(ours.matched, none.matched, page.next_cursor) // pass next_cursor back as `cursor` for the next page
```

| Query             | What it does                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `partner`         | the address the fee is paid to (Schnorr, ECDSA or P2SH, on this network), or `'none'`. Bare hex, `covenant:…` and another network's address are refused before anything is asked (`InvalidAddressError`). A tracker that predates the fee ignores `partner` and answers other names: the page is then refused, `ApiError` with `code` `partner_ignored` |
| `sort`            | `price_asc`, `price_desc` (by price), `listed_newest`, `listed_oldest` (by when the listing was made): a `ListingSort`, all four in `LISTING_SORTS`; also `hash`, `newest`, `oldest`. Ties go by hash; a listing whose time the tracker does not know comes last                                                                                        |
| `cursor`, `limit` | the last page's `next_cursor`, passed back unchanged; at most 1000 a page                                                                                                                                                                                                                                                                               |
| `owner`           | the seller's address: one account's listings                                                                                                                                                                                                                                                                                                            |
| `q`               | the names that contain this text, ignoring case: a search box                                                                                                                                                                                                                                                                                           |
| `collection`      | the names of one shape: `1character`, `2character`, `3character`, `4character`, `5*character` (by code points of the label, five or more for the last), or `99`, `999`, `9999` (two, three or four digits only). Another value is refused, `ApiError` with `code` `bad_request`                                                                         |

Each record carries `listed_price_sompi`, `listed_at` (when the listing was made, in ms) and, for a listing with a
fee, `listed_fee_bps`, `listed_fee_sompi` (the fee on that price) and `listed_fee_to_address`, the address to show.
Two more fields are the payee as the listing's state holds it: `listed_fee_to`, 32 bytes in hex, read by
`listed_fee_scheme` (0 Schnorr, 3 P2SH, 133 or 134 ECDSA) as `owner_pubkey` is read by `owner_scheme`. `resolveName`
reads them as `listedPriceSompi`, `partnerFee` (`{ address, bps, sompi, to }`, null for none; `to` is the payee as an
`Owner`) and `listedAt`. With a node, the fee is proven with the rest of the listing, because it is part of the
listing's address. The raw call is `kns.api.domains({ listed: true, partner, sort })`.

**List.** Without `partnerFee` the whole price goes to the seller.

```ts
import { parseKas } from '@knsdomains/sdk'
import { partnerFeeWaivedText } from '@knsdomains/sdk-tx'

const plan = await tx.planList('alice.kas', parseKas('25'), { partnerFee: { address, bps: 250 } })
show(plan.summary) // 'list alice.kas for sale at 25 KAS, of which 0.625 KAS (2.5%) is a partner fee to kaspatest:…: the seller gets 24.375 KAS'
if (plan.partnerFeeWaived) show(partnerFeeWaivedText(plan.partnerFeeWaived)) // the fee came to less than 0.2 KAS
// The seller confirms the fee with the listing; then:
await tx.submit(plan)
```

- The rate is a whole number of basis points from 1 to 1000. 1000 (10%) is the cap, a contract constant; more is
  refused. 0 is no fee: leave `partnerFee` out.
- The address is a Kaspa address of this network: a key (Schnorr or ECDSA) or a script hash (a multisig). Bare hex
  and `covenant:…` are refused, before anything is signed.
- **A fee under 0.2 KAS is left out, not refused.** `MIN_PARTNER_FEE_SOMPI` is 0.2 KAS: a fee that comes to less is
  not written into the listing, which then carries no fee, and the plan says so in `summary` and in
  `partnerFeeWaived` (`{ requestedBps, feeSompi, minimumSompi }`). Show it to the seller in your own words before they
  sign, for example "the 0.15 KAS fee is under the 0.2 KAS minimum, so this listing has no fee". At 10% the
  lowest price that keeps a fee is 2 KAS, at 1% 20 KAS, at 0.1% 200 KAS. The one-step `tx.list(…)` answers the same
  `partnerFeeWaived` beside the module's result (`Listed`), but only once the listing is signed and sent: to tell the
  seller before, plan first.
- Why the minimum is here and not in the contract: Kaspa's storage mass (KIP-9) charges a plain output about
  10^12 / amount, so a fee output of 0.02 KAS alone would be 500,000, a whole transaction's limit, and a purchase
  paying it could never be mined. A contract's rules are fixed for the life of its lineage and the network's mass
  limits are not, so the contract accepts any fee under the cap, and the packages and the CLI keep the minimum, where
  it can change without a redeploy.
- The fee cannot be changed on a listing: cancel it and list again.

**Cancel.** `planCancel(name)` takes the listing down. The listing's fee is part of the address the listing sits at,
so the plan carries it; a cancel pays nobody.

**Buy.**

```ts
const r = await kns.resolveName('alice.kas')
if (r && r.listedPriceSompi !== null) {
  const plan = await tx.planBuy('alice.kas', { expectedPriceSompi: r.listedPriceSompi })
  show(plan.summary) // 'buy alice.kas for 25 KAS from kaspatest:…: 24.375 KAS to the seller and 0.625 KAS (2.5%) partner fee to kaspatest:…'
  show(plan.sale?.sellerSompi, plan.sale?.partnerSompi, plan.spendsSompi) // the two parts, and what the wallet pays
  await tx.submit(plan) // after the buyer confirms
}
```

The buyer pays the price, `spendsSompi`, as for any listing: the fee is part of it, not on top. The module pays the
seller the price less the fee at output 1 and the partner the fee at output 3, two outputs even when the seller is
the partner, and the contract refuses a purchase that pays either one less. A listing written by another tool with a fee (or a seller's
part) under 0.2 KAS is bought by paying that part 0.2 KAS, which a payment that small needs to be mined;
`spendsSompi` is then more than the price, and `summary` says why.

| Who         | Sees before signing                                                                                                    | Signs                                   | Receives                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| The seller  | `planList`'s `summary` and `sale`: the price, the fee and their own part; `partnerFeeWaived` when the fee was left out | the listing, and with it the fee        | the price less the fee, when the name sells                   |
| The buyer   | `planBuy`'s `summary`, `sale` and `spendsSompi`                                                                        | the purchase, with their own coins only | the name                                                      |
| The partner | its listings, `kns.listings({ partner })`                                                                              | nothing                                 | the fee, at output 3 of every purchase, through any front end |

**What a marketplace asks next.**

- **What it earned.** A fee arrives as an ordinary payment to the partner's address, output 3 of the purchase. To
  tie it to a name, keep the names whose listings you wrote and read their `kns.history(name)`: a `sold` event has
  the price and the listing's `listed_fee_*` fields, and its `txid` is the purchase. The tracker has no query for the
  sales that paid one partner; `kns.listings({ partner })` answers only the listings still open.
- **How often it may ask.** The tracker itself sets no per-caller limit on reads. It works on at most 256 requests
  at once and cuts one off after 10 seconds; past either it answers 503, an `ApiError` with `status` 503 and no
  `code`: wait a moment and ask again. The one rationed route is the profile pin of section 6.5. The public host sits
  behind a gateway, which may answer heavy traffic with a 429 or a challenge page, an `ApiError` without a `code`
  (`status` says which): back off and retry. Page a listing with `next_cursor`, up to 1000 records a page, rather
  than asking for it whole each time.
- **Testnet KAS** for a test sale comes from the faucet of [section 10](#10-testing-your-integration).
- **A backend in another language** reads the same tracker over HTTPS: `kns.listings` is
  `GET https://gap-tn10.knsdomains.org/v1/domains?listed=true&partner=…&sort=…`, and each record has the fields of
  `DomainRecord` in `@knsdomains/sdk`'s types. A reference for the HTTP routes will follow; until then, `kns.api` has
  one method per route.

## 7. Errors

Everything the packages throw extends `KnsError`, except a call you cancel, which rejects with your abort reason.

Reads (`@knsdomains/sdk`):

| Error                   | When                                                                      | What the wallet does                                                                                                |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `InvalidNameError`      | the input cannot be a name; `message` says why                            | show the message                                                                                                    |
| `InvalidAddressError`   | not an address, another network's, or bare hex as a recipient             | show the message                                                                                                    |
| `RefutedError`          | the node contradicts the tracker                                          | stop; do not pay; the tracker is wrong or behind                                                                    |
| `ApiError`              | the tracker refused; branch on `code`, never on `message`                 | `rate_limited`, `not_ready`: try later; `partner_ignored`: ask without `partner`; others: name features unavailable |
| `RegistryMismatchError` | the tracker serves another deployment than this build                     | turn name features off and ask for an update ([section 11](#11-keeping-up-with-deployments))                        |
| `NodeError`             | no node, or one the client cannot use (no `--utxoindex`, no covenant ids) | use another node                                                                                                    |
| `TimeoutError`          | the call outlived `timeoutMs`                                             | try again                                                                                                           |
| `ConfigError`           | options that describe no usable registry                                  | a bug in the integration                                                                                            |
| `WasmApiError`          | `new KnsTx` was handed a module of another API version                    | install `@knsdomains/sdk-tx` and the `@knsdomains/wasm` it names together                                           |

`new KnsTx` throws `ConfigError` for a signer bound to another network and for a `privateKey` where a `window`
exists, and `WasmApiError` for a module of another API version. Its calls throw the errors above too, always before
the wallet signs: `InvalidAddressError` for a recipient or a partner fee address that cannot be paid,
`InvalidNameError`, `ConfigError` or `NodeError` for a client without what the call needs (a signer, `nodeUrl`),
`RegistryMismatchError` for a module that derives another deployment, and the tracker's `ApiError` and
`TimeoutError`. Most other refusals are a `KnsTxError`, with a `code`, the `op` it came from, and two fields that
say whether something may have been sent:

| `code`                              | Meaning                                                                                     | What the wallet does                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `taken`                             | somebody holds the name (or the subdomain)                                                  | say so; nothing was signed                             |
| `insufficient-funds`                | the account cannot pay; the message has the breakdown                                       | show what is missing                                   |
| `registration-closed`               | open registration has not started on this deployment                                        | show when it opens (`registrationWindow()`)            |
| `wallet-declined`                   | your signer threw, or signed nothing for an input it was asked to                           | nothing was sent                                       |
| `signature-invalid`                 | a returned signature does not verify: wrong key, wrong hash, high-S, an unreadable document | a bug in your signer; nothing was sent                 |
| `lost-race`                         | somebody spent the same registry output first, and the module gave up                       | try again; for a registration, check `available` first |
| `not-accepted`                      | the module sent a transaction (`sentTxid`) and did not see it accepted within a minute      | do not resend: look it up first                        |
| `not-registered`                    | the name you act on is not registered                                                       | refresh the screen                                     |
| `hint-refuted`                      | the tracker's record did not check out against the chain                                    | try again in a moment                                  |
| `node-unreachable`                  | the node did not answer                                                                     | use another node                                       |
| `deployment`, `entrypoint-disabled` | the deployment refuses the operation                                                        | name features unavailable                              |
| `unknown`                           | anything else; product-rule refusals end "Nothing was signed"; a `waitForIndex` timeout     | show your own message; log this one                    |

`afterSigning` is true when your signer had returned signatures before the refusal: a transaction may have been
sent even without a `sentTxid`. **Never retry such a refusal automatically.** Look at the name first
(`waitForIndex`, `kns.lookup`) and offer "try again" only when it shows nothing. A `signature-invalid` refusal is
never marked: the module checks signatures before it sends. Catch `KnsError`, the base of every error of both
packages, so that none slips past:

```ts
import { KnsError } from '@knsdomains/sdk'
import { KnsTxError } from '@knsdomains/sdk-tx'

try {
  await tx.submit(plan)
} catch (e) {
  if (!(e instanceof KnsError)) throw e // your own abort reason, or a bug
  if (e instanceof KnsTxError && e.afterSigning) show('This may have been sent. Checking…', e.sentTxid ?? '')
  else show(e.message) // nothing was sent: a KnsTxError's code, or the error's class, says why
}
```

## 8. Nodes

`@knsdomains/sdk-tx` needs a node of the same network with `--utxoindex`, over wRPC: **Borsh** for `nodeUrl`, and
**JSON** if you also prove reads or follow the chain. From an https page, use `wss://`. A node must know covenant ids;
the packages refuse a client that does not, rather than read every name as unregistered.

**The Kaspa public node network** answers the least-loaded public node for a network through its resolvers. The same
host serves JSON wRPC at `/wrpc/json`:

```ts
async function publicNode(network: string): Promise<{ borsh: string; json: string }> {
  for (const resolver of ['eric.kaspa.stream', 'maxim.kaspa.stream', 'john.kaspa.red', 'mike.kaspa.red']) {
    try {
      const res = await fetch(`https://${resolver}/v2/kaspa/${network}/tls/wrpc/borsh`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const { url } = (await res.json()) as { url?: unknown }
      if (typeof url === 'string' && url.startsWith('wss://') && url.endsWith('/wrpc/borsh'))
        return { borsh: url, json: url.replace(/\/wrpc\/borsh$/, '/wrpc/json') }
    } catch {
      // try the next resolver
    }
  }
  throw new Error(`no public ${network} node answered`)
}
```

The loop skips a resolver that is down, busy, or that a page cannot read (a browser refuses an answer without a CORS
header and logs it in the console), and asks the next. Every write in this guide was tested through public
testnet-10 nodes picked this way. Public nodes are shared and
can be busy: when a call fails with `node-unreachable`, pick another. For production, run your own node or use a
provider, with `--utxoindex` and the wRPC endpoints enabled.

## 9. Safety checklist

What the packages already do, and what is left to your interface:

| Rule                                                                         | Done by                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A name is shown only when it hashes to the record; otherwise a short hash    | the packages (`display`, `resolved.shown`)                                  |
| The tracker serves this build's deployment                                   | the packages (`RegistryMismatchError`)                                      |
| Taken and holder are judged by outputs that carry the deployment's anchor id | the packages, with a node                                                   |
| A profile is shown only when its bytes match the chain                       | the packages (`profileOf`)                                                  |
| Pay the holder's address and nothing else                                    | the packages (`recipientFor().address`), and you: never a profile's address |
| Show the standard spelling, never what was typed                             | you: show `name`                                                            |
| Note names beyond `a-z 0-9 -`                                                | you: `nonAscii`                                                             |
| Strip direction and invisible characters from profile text                   | you: `sanitizeText`; `isRenderableUrl` for links                            |
| Warn that names change hands, and that a listed name pays its seller         | you                                                                         |
| Warn before a name goes to a multisig or a contract, with the module's text  | you: `plan.recipient.warn`, `warnings`                                      |
| Show a sale's split: the seller's part and the partner fee                   | the packages (`plan.sale`, `summary`) and you                               |
| Tell the seller when a partner fee under 0.2 KAS was left out of a listing   | you: `plan.partnerFeeWaived` (`list` answers it too, after signing)         |
| Flag a profile written for another name                                      | you: `nameMatches`                                                          |
| Show only the name the holder chose for an address                           | the packages (`primaryNameFor`)                                             |
| Resolve again right before signing a payment                                 | you                                                                         |

## 10. Testing your integration

Run this on testnet-10 before you ship. The scripts in [`examples/wallet`](examples/wallet) do each step with the
signer of section 6.2, and KNS ran the list with them through public nodes. The partner-fee sale of step 9 was run
by the packages' live test, with the calls `marketplace.mjs` makes. Testnet KAS comes from the
testnet-10 faucet, `https://faucet-tn10.kaspanet.io`, which asks for a human check in a browser; when it gives less
than a test needs (a five-character name needs 37 KAS), ask KNS.

1. **Reads.** `recipientFor` a held name, its upper-case spelling and with a leading space (same name, standard
   spelling), a free name (`unresolved`), `not a name` (`neither`) and an address (`address`).
   `primaryNameFor` an address with and without a chosen name.
2. **The module loads** where your wallet runs it: Node, a page, an extension's popup and its service worker.
3. **`probeSigner`** answers `ready…` for every kind of account you support, Schnorr and ECDSA. Fund each with a
   little testnet KAS first.
4. **Register** a name of five or more characters (37 KAS). Watch the phases, then `waitForIndex`.
5. **Primary name**: set it, see it from `primaryNameFor`, clear it.
6. **Pay the name** from another account through your level 1 screen. The holder receives it.
7. **Profile**: write one, see `profileOf` answer `verified`.
8. **Transfer** to another account and back, across schemes if you support both.
9. **Sell and buy**: list from one account, buy from another at the listed price. A buy at another price is refused
   before signing, and the sale clears the profile and the primary flag. List with a partner fee, buy it, and see the
   seller paid at output 1 and the partner at output 3; list with a fee under 0.2 KAS and see the plan say the listing
   has none.
10. **Subdomain**: mint one, then mint it again (`taken`, before any plan).
11. **Failures**: decline inside your signer (`wallet-declined`), register from an account that cannot pay
    (`insufficient-funds`), sign with the wrong key (`signature-invalid`). Nothing is sent in any of the three.

## 11. Keeping up with deployments

- **Check once at start.** `await kns.status()` answers `sameRegistry: false` when the tracker serves another
  deployment, and every call then refuses with `RegistryMismatchError`. Turn name features off and say an update is
  needed. Sending to plain addresses is not affected.
- **A new testnet lineage is a new release** of the three packages, versioned with its anchor (`x.y.z-tn10.<anchor8>`)
  and published under the dist-tag `tn10`. Update `@knsdomains/sdk` and `@knsdomains/sdk-tx` together
  (`npm install --save-exact @knsdomains/sdk@tn10 @knsdomains/sdk-tx@tn10`), and the wasm module follows. Each package's
  `CHANGELOG.md` says what changed for integrators.
- **Mainnet** comes as a release with a mainnet entry and its own tracker. Testnet builds never resolve mainnet
  names.

## Reference

- [`@knsdomains/sdk` README](api/sdk.md): every read call, the options, the errors.
- [`@knsdomains/sdk-tx` README](api/sdk-tx.md): every write call, plans, signers, the chain follower,
  multisig holders.
- [`@knsdomains/wasm` README](api/wasm.md): loading, versions, provenance.
- [Signing KNS transactions](wallet-signing.md): the signature hash, for wallets that recompute it.
- [`examples/walkthrough.html`](examples/walkthrough.html): every write as code.
