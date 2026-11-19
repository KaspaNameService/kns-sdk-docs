# @knsdomains/sdk-tx

Register a `.kas` name, move it to another holder, change its profile, set it as the address's primary name, list it for
sale, buy a listed one, and mint subdomains under it, through a wallet. This package is the write half of a pair:
[`@knsdomains/sdk`](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/api/sdk.md) reads the registry, and this
one builds, signs and submits transactions against it, over the KNS wasm module
([`@knsdomains/wasm`](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/api/wasm.md)).

```bash
npm pkg set type=module   # a new project: the packages are ES modules
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e @knsdomains/sdk-tx@0.1.0-tn10.4d10952e
```

`@knsdomains/wasm` comes with it, at the exact version this release was tested with. A wallet that holds its own keys
writes its own signer ([Signers](#signers)); the
[quickstart](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/quickstart.md) has each task as a short recipe,
and the [wallet integration guide](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/wallet-integration.md)
takes it through every step with code tested on testnet-10. The Vite 6 and 7 dev servers and a Chrome extension each
need one line of configuration first
([`@knsdomains/wasm`](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/api/wasm.md#where-the-wasm-comes-from)).

The module carries the same silverscript compiler and contract sources as the reference implementation, because a
covenant's address is the hash of its compiled script; nothing here re-implements a transaction. Every operation reads
the name's current state from the tracker, has the module confirm it against the chain, checks the product rules while
nothing has been signed, and only then hands the frozen transaction to the wallet. The module verifies every signature
that comes back against its own hash before anything is sent.
[`examples/walkthrough.html`](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/examples/walkthrough.html)
shows every operation here as code, with what it answers and where the wallet prompts.

## Use

```ts
import { Kns } from '@knsdomains/sdk'
import { load } from '@knsdomains/wasm'
import { KnsTx, kaswareSigner } from '@knsdomains/sdk-tx'

const kns = new Kns({ network: 'testnet-10' })
const wasm = await load()
const nodeUrl = 'wss://…' // a Kaspa node with --utxoindex; wss:// under https
const tx = new KnsTx({
  kns,
  wasm,
  nodeUrl,
  signer: await kaswareSigner({ network: 'testnet-10' }), // or kastleSigner
})

await tx.probeSigner() // once per wallet build: will it sign a covenant input, and does its sighash match

const done = await tx.registerName('alice.kas', {
  onProgress: (p) => show(p.phase), // checking, signing (the one wallet prompt), broadcasting, done
})
show(done.warnings) // the module's handover warnings; empty for a key
await tx.waitForIndex('alice.kas', done.txid) // the tracker is seconds behind the chain
```

## Calls

| Call                                                     | What it does                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `registerName(name, { onProgress, profile })`            | register a root name in one transaction and one wallet prompt; answers its `txid`, fee and `warnings`                          |
| `transfer(name, to, { profile })`                        | hand a name over; the profile is kept, cleared, or replaced; the primary flag stays only for a transfer to yourself            |
| `updateProfile(name, cidOrHex \| null)`                  | point the profile at a document, or clear it                                                                                   |
| `setPrimary(name)`, `clearPrimary(name)`                 | the on-chain primary-name flag                                                                                                 |
| `list(name, priceSompi, { partnerFee })`, `cancel(name)` | offer a name for sale, at least 0.2 KAS, with a marketplace's partner fee when one is given; withdraw the offer                |
| `buy(name, { expectedPriceSompi, profile })`             | buy at the price the buyer saw, a partner fee paid out of it; the buyer gets an empty profile unless one is given              |
| `mintSubdomain(parent, label, to)`                       | mint `label.parent` for `to`; the parent's holder locks its deposits and pays the 1 KAS subdomain fee; it cannot be taken back |
| `plan…(…)`, `submit(plan)`                               | every spend above in two steps: a `Plan` says what the wallet will be asked, with nothing signed; `submit` runs it             |
| `describeRecipient(to)`                                  | what a recipient address is, and whether to warn (a multisig or a contract)                                                    |
| `domainOf(name)`                                         | the name's state from the tracker, confirmed by the module on the node                                                         |
| `probeSigner()`                                          | two questions to the wallet, nothing broadcast                                                                                 |
| `registrationWindow()`                                   | the network's DAA score and the score at which open registration starts                                                        |
| `waitForIndex(name, txid)`                               | wait until the tracker shows the transaction                                                                                   |
| `waitForAcceptance(txid)`                                | where the chain accepted the transaction, through the follower                                                                 |
| `multisig(redeemScript)`                                 | the same calls for a name a multisig holds; each builds a signing file and sends nothing                                       |
| `reviewMultisig`, `signMultisig`, `finishMultisig`       | a co-signer's round trip over a signing file: read it, sign it with a key, send it                                             |
| `hash(name)`, `lookup(name)`, `status()`                 | the module's own hashing, the node's view of a name, and the deployment in force in this instance                              |

Every call that signs is refused before the prompt when the connected account does not hold the name, when the
name is listed (a listing contract holds it; cancel first), when a listing price is under 0.2 KAS, when a partner
fee is over 1000 basis points, when a buyer's expected price is not the listing's, or when a subdomain is given to
`registerName` (the parent's holder mints it). Such a refusal is a `KnsTxError` with a `code` to branch on and `op`
naming the operation; `afterSigning` and `sentTxid` say whether a transaction may have gone out (see Registration).
The calls also throw `@knsdomains/sdk`'s errors, always before the wallet signs: `InvalidAddressError` for a recipient or a
partner fee address that cannot be paid, bare hex included (a key and a multisig's script hash look the same),
`InvalidNameError`, `ConfigError` or `NodeError` for a client
without what the call needs (a signer, `nodeUrl`, the tracker), `RegistryMismatchError` for a module that derives
another deployment, and the tracker's `ApiError` and `TimeoutError`; `new KnsTx` throws `WasmApiError` for a module of
another API version. All of them, `KnsTxError` included, extend `KnsError`: catch that.

| `code`                              | Meaning                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `taken`                             | the name, or the subdomain, has a holder; nothing was signed                                      |
| `insufficient-funds`                | the account cannot pay; the message has the breakdown                                             |
| `registration-closed`               | open registration has not started on this deployment                                              |
| `wallet-declined`                   | the signer threw, or signed nothing for an input it was asked to                                  |
| `signature-invalid`                 | a returned signature does not verify, or the returned document has none to read; nothing was sent |
| `lost-race`                         | somebody spent the same registry output first, and the module gave up                             |
| `not-accepted`                      | the module sent `sentTxid` and did not see it accepted in time; look it up before resending       |
| `not-registered`                    | the name acted on is not registered                                                               |
| `hint-refuted`                      | the tracker's record did not check out against the chain                                          |
| `node-unreachable`                  | the node did not answer                                                                           |
| `deployment`, `entrypoint-disabled` | the deployment refuses the operation                                                              |
| `unknown`                           | anything else, product-rule refusals included; their message ends "Nothing was signed"            |

## Plans

Every spend of a name you hold is two steps. `planTransfer`, `planUpdateProfile`, `planSetPrimary`,
`planClearPrimary`, `planList`, `planCancel`, `planBuy` and `planMintSubdomain` read the name's state from the
tracker, have the module confirm it on the node, apply the product rules and answer a `Plan`: the `op`, the
verified `domain`, the `recipient` when there is one, what the wallet spends beyond the network fee in
`spendsSompi` (a buy's price, a subdomain's deposits and its 1 KAS fee, else 0) and a one-line `summary` to show.
A listing, a cancel and a buy also answer `sale`, the price and how it splits between the seller and a marketplace
partner, and a listing whose partner fee was left out answers `partnerFeeWaived`.
The wallet pays the network fee of every spend (API v8); the name's deposit is never spent on it. Nothing is
signed. `submit(plan)` hands it to the module and the wallet and answers the op's own result; the one-step
calls are the two in a row. A plan built on a state the chain has since moved past is refused by the module,
so build it close to the prompt.

```ts
const plan = await tx.planTransfer('alice.kas', to)
confirm(plan.summary, plan.recipient) // warn on a multisig or a contract
await tx.submit(plan)
```

## The marketplace partner fee

```ts
const plan = await tx.planList('alice.kas', 2_500_000_000n, { partnerFee: { address, bps: 250 } })
// plan.sale: { priceSompi: 2500000000n, partnerFee: { address, bps: 250, sompi: 62500000n, … }, sellerSompi: 2437500000n, … }
// plan.partnerFeeWaived: set when the fee came to less than 0.2 KAS, and the listing carries none
// Or both steps in one call, for a screen that shows nothing in between:
const listed = await tx.list('alice.kas', 2_500_000_000n, { partnerFee: { address, bps: 250 } })
// listed: the module's ListResult, and the same partnerFeeWaived when the fee was left out (`Listed`)
```

A listing can carry a marketplace's fee: an address and a rate of 1 to 1000 basis points of the price, written
into the listing and agreed to by the seller's signature. Every purchase, built by any front end, pays the fee to
that address at output 3 and the rest of the price to the seller at output 1, or the contract refuses it; a buyer
pays the price, the fee included. `planCancel` and `planBuy` pass the listing's own fee to the module, because it is
part of the listing's address, and `planBuy`'s summary names both parts.

The cap (1000, 10%) is the contract's. The minimum is this package's: a fee that comes to less than 0.2 KAS
(`MIN_PARTNER_FEE_SOMPI`) is not refused but left out, and the listing carries no fee. A payment that small costs
more storage mass than a purchase can carry (KIP-9: about 10^12 / amount per output, 500,000 for a 0.02 KAS output,
the limit of a whole transaction), so a purchase paying it could never be mined. The contract does not enforce it
because its rules are frozen for a lineage and the network's mass limits may change; KNS's command-line tool follows
the same rule, with the same constant. `partnerFeeTerms` is the rule, `partnerFeeWaivedText` the sentence for a
confirmation, and `purchasePayments` what a buy pays each payee, from the price and the fee's rate (a `PartnerFee`
or just `{ bps }`). A listing's price is at least `MIN_LISTING_SOMPI` (0.2 KAS) and at most `MAX_LISTING_SOMPI`
(2^53 − 1 sompi, the largest the module carries exactly). Testnet-10 lineage `4d10952e…`, the one this build carries, runs the fee: the live test sells a
name there with one and finds the partner paid at output 3.

## Registration

A registration is one transaction (since kns-wasm API v7, which replaced the commit and reveal of earlier versions):
it spends the gap the name falls in, locks the name's three deposits of 0.6 KAS, pays the fee by length, and
the name is registered once it is accepted. There is no salt to keep, nothing to resume and nothing to
reclaim. Before the wallet is asked, `registerName` checks the opening score, that the name is free, and that
the module spells it as `@knsdomains/sdk` does; the module then refuses a wallet that cannot pay
`quote(name).totalToFund` (the fee, 1.8 KAS of deposits and a 0.2 KAS network-fee allowance; what the fee leaves
of it comes back only as change over 0.2 KAS, so fund a little more than that). A gap spent by someone else first
is rebuilt on a fresh gap by the module, which may prompt again. Whoever's registration is accepted first holds
the name: the protocol accepts front-running.

A refusal after the wallet signed has `afterSigning` set: the module had sent, or was sending, the transaction
and waits for it to be accepted, so it may still land. `sentTxid` names it when the refusal does (code
`not-accepted`: "Transaction … was not accepted within 60 seconds"); look it up, or at the name, before trying
again. Spends through `submit` are marked the same way. A `signature-invalid` refusal is never marked: the module
checks every returned signature before it sends.

The answer's `warnings` is the module's handover text for the new holder (API v8, never absent): empty for a
key, and for a multisig or a contract the warning a wallet must show (a multisig must only ever sign
SIGHASH_ALL). Every builder answer carries it.

## Signers

A `KnsSigner` is the account and one call, `sign(safeJson, signInputs)`: the frozen transaction in kaspa-wasm
Safe JSON, and the inputs to sign, each with its sighash type (always 1), the owner's scheme and the hash the
module computed. The adapters forward what their wallet takes:

| Wallet         | Call                                  | Quirks the adapter carries                                                                              |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| KasWare 0.9+   | `signPskt({ txJsonString, options })` | inputs must be named, or it signs the registry's witness too; only `index` and `sighashType` are passed |
| Kastle 2.59.1+ | `signTx(networkId, txJson, scripts)`  | positional; `signType` is a string; never `scriptHex`; a cancelled prompt resolves with a bare string   |

Both re-read the account and the network right before the prompt, because an extension can move off either at
any time and would sign with another key. A Ledger-backed Kastle account connects, reports a key, and refuses
to sign; the refusal names that as one cause. ECDSA accounts work: the adapter reads the scheme from the
address and carries the 66-hex compressed key.

A wallet that holds its own keys implements `KnsSigner` itself. For each entry of `signInputs`, it signs `sighash` with
the account's key (BIP-340 Schnorr, or a 64-byte compact low-S ECDSA signature over the hash as given), writes
`41 ‖ signature ‖ 01` into that input's `signatureScript`, changes nothing else, and answers the document. It signs only
the inputs named, refuses any sighash type but 1, and never broadcasts. A spend of a name also asks for the name's own
covenant output, which is not at the account's address; a wallet that will not sign it cannot manage names, and
`probeSigner()` finds that out without broadcasting. `ownerPubkey` is 64 hex (x-only) for Schnorr and 66 hex
(compressed) for ECDSA. The [wallet integration
guide](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/wallet-integration.md#62-your-signer) has a complete
signer, tested on testnet-10 with both schemes.

A program that holds a key, such as an operator's script under Node, passes `privateKey` instead of a signer;
the module signs inside. A page is refused that option. `privateKey` is the 32-byte secret key as 64 hex characters,
and `privateKeyScheme` says which owner it acts as: `'schnorr'` (the default) or `'ecdsa'` ([Options](#options)).

## Options

| Option               | What it is                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kns`                | the read client from `@knsdomains/sdk`: the registry, the tracker and the rules. Required                                                                            |
| `wasm`               | the loaded module, `load()` from `@knsdomains/wasm` or `loadNode()` from `@knsdomains/wasm/node`; one instance per registry. Required                                |
| `nodeUrl`            | the node the module connects to, Borsh wRPC with `--utxoindex` (`wss://` under https); every op that reaches the chain needs it                                      |
| `signer`             | the wallet, a `KnsSigner`: `kaswareSigner`, `kastleSigner` or your own; every op that signs goes through it                                                          |
| `privateKey`         | in place of `signer`, under Node only: the 32-byte secret key as 64 hex characters. Refused where a `window` exists                                                  |
| `privateKeyScheme`   | which owner `privateKey` acts as: `'schnorr'` (the default), its x-only key, or `'ecdsa'`, its compressed key. One key is two different owners under the two schemes |
| `feeRateSompiPerKg`  | the network fee rate, a `bigint` in sompi per kilogram of transaction mass; default the module's, `100_000n` (100 sompi per gram)                                    |
| `follower`           | a `ChainFollower`, or a source to make one from (`fromRpcClient`, `fromWrpc`, `fromNodeInfo`, `fromKaspaRest`), for `waitForAcceptance`                              |
| `gapResolver`        | how a registration finds its gap; default by hash prefix through the tracker, which tells it no name                                                                 |
| `extras`             | the lineage's session values; default the ones bundled for the read client's registry                                                                                |
| `allowEmptySnapshot` | test networks only                                                                                                                                                   |

## Following the chain

A `ChainFollower` (the `follower` option) answers `waitForAcceptance(txid)`: where the chain accepted a
transaction, or null when it was not seen in time, which is not the same as not accepted. It also waits for a
DAA score (`waitForDaa`), for a page that counts down to the opening of registration.

| Source                             | What it needs                                                     | Pushes | Answers by txid |
| ---------------------------------- | ----------------------------------------------------------------- | ------ | --------------- |
| `await fromRpcClient(rpc)`         | a connected rusty-kaspa wasm SDK `RpcClient`, v2 or newer         | yes    | from the stream |
| `fromNodeInfo(wasm, nodeUrl, net)` | the module; one connection per ask                                | no     | no              |
| `await fromWrpc(client)`           | a `WrpcJson` connection from `@knsdomains/sdk`, the JSON endpoint | yes    | from the stream |
| `fromKaspaRest('https://api…')`    | a Kaspa REST API, a third party's word                            | no     | yes             |

`followerOf(source)` makes the follower, and the `follower` option takes a source as it is; one per connection,
`close()` when the page is done with it. `fromRpcClient` and `fromWrpc` subscribe first, so they answer a promise.
Both packages export a `fromWrpc`: `@knsdomains/sdk`'s makes a node that proves reads, this one a chain source. One
`WrpcJson` connection serves both, with one imported under another name:

```ts
import { Kns, WrpcJson, fromWrpc } from '@knsdomains/sdk'
import { KnsTx, fromWrpc as chainFromWrpc } from '@knsdomains/sdk-tx'

const rpc = await WrpcJson.connect('wss://node.example/kaspa/testnet-10/wrpc/json')
const kns = new Kns({ network: 'testnet-10', node: fromWrpc(rpc, { network: 'testnet-10' }) }) // proves reads
const follower = await chainFromWrpc(rpc) // follows the chain over the same connection
const tx = new KnsTx({ kns, wasm, nodeUrl, signer, follower })
```

## Multisig owners

A name an m-of-n Schnorr multisig holds is spent in three steps, with nothing signed by this package:

```ts
import { multisigRedeemScript } from '@knsdomains/sdk-tx'

const redeem = multisigRedeemScript([xonlyA, xonlyB, xonlyC], 2) // OP_2 <A> <B> <C> OP_3 OP_CHECKMULTISIG
const ms = tx.multisig(redeem) // ms.address is the multisig's; a name is sent to it with tx.transfer
const build = await ms.transfer('alice.kas', 'kaspatest:q…') // one fixed transaction, built on the node
// build.file goes to the co-signers: tx.signMultisig(file, key) under Node, or KNS's CLI: `kns-domain multisig sign`
const one = await tx.signMultisig(build.file, keyA) // one.ready is false until m signatures are in
const two = await tx.signMultisig(one.file, keyC)
await tx.finishMultisig(two.file) // m signatures in key order into every coin, checked, sent
```

`ms` has `register`, `transfer`, `updateProfile`, `setPrimary`, `clearPrimary`, `list` (with a `partnerFee`, under
the same rules; a waived one is `build.partnerFeeWaived`), `cancel` and `mintSubdomain`. A registration or a subdomain carries its gap in the file, so a lost race is a new build.
The multisig pays network fees (and a registration's fee and deposits) from its own coins, so it must hold
them. `build.warnings` says what holding a name as a multisig means; show it before anyone signs. A co-signer in a page
has no wallet call that signs a bare hash, so it hands the file to a key holder; `withSignatures(file, sigs)`
takes signatures made elsewhere.

## What the module is

`@knsdomains/wasm`, bound to one registry: this package checks that the deployment in force in the instance is the
one `@knsdomains/sdk` carries (`manifest_digest`) before anything is built, and refuses an instance that speaks
another API version. One instance serves one lineage. The module connects to `nodeUrl` itself for every op
that reaches the chain; cancellation through `signal` takes effect between steps, not inside one.

## The live test

Each release passes KNS's live test against a real testnet before it is handed out: a registration through a
software wallet taking the wallet path and one through a private key, the probe, every spend, a sale with a
marketplace partner fee, the multisig round trip and a registration the multisig signs, each confirmed by the
tracker. It spends testnet funds from three throwaway keys and runs only from the package sources, so it does not
come with the package files.

## What this package leaves out

Reads: those are `@knsdomains/sdk`. A co-signer signing a multisig file with a wallet extension: no extension
signs a bare hash today. Operator operations (migrate, the genesis) stay in the Rust CLI.
