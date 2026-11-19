# @knsdomains/sdk

This package resolves `.kas` names on Kaspa. It turns a name into the address that pays it, and an address
into the name its owner chose to show. It also says whether a name is free, and what registering it costs. It
only reads, and nothing here needs a wallet or a wasm module.

One call does what most integrators need. `recipientFor` takes whatever a person typed, a name, a subdomain
or an address, and answers the address to pay, or why there is none. The narrower calls answer more about one
kind of input.

```bash
npm pkg set type=module   # a new project: the package is an ES module
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e
```

Building a wallet? Start with the
[quickstart](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/quickstart.md); the [wallet integration
guide](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/wallet-integration.md) takes sending to a name,
showing names and managing them step by step, with code tested on testnet-10. Writes are
[`@knsdomains/sdk-tx`](https://github.com/KaspaNameService/kns-sdk-docs/blob/main/api/sdk-tx.md).

It runs on Node 22.12 or later, and in evergreen browsers. Its only runtime dependencies are
`@noble/hashes` and `@adraffy/ens-normalize`, the second pinned to the exact release whose data the Rust
reference implementation ships.

## A recipient field

```ts
import { Kns } from '@knsdomains/sdk'

const kns = new Kns({ network: 'testnet-10' })

async function onRecipient(input: string) {
  const r = await kns.recipientFor(input) // never throws on the input
  switch (r.kind) {
    case 'address':
      return pay(r.address, r.ownerType) // warn before paying a 'p2sh' (multisig) address
    case 'domain':
    case 'subdomain':
      return r.address ? pay(r.address, r.ownerType, r.listed) : show(r.fault)
    case 'neither':
      return show(r.reason)
  }
}
```

`pay` and `show` are your wallet's own.

The answer is an arm for what the input is. An address pays itself, and `ownerType` says what kind of address
it is, so a wallet can warn before sending to a multisig or a contract. A name pays
the address of its on-chain holder, which a node has checked when `proven` is true, or carries a `fault`:

| Fault         | When                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------- |
| `unresolved`  | the tracker has no record: free, or registered but not described, or a tracker behind       |
| `in-covenant` | a contract holds the name, and a contract has no address to pay                             |
| `withheld`    | the recorded spelling breaks the naming rules, so the name is shown but never resolved      |
| `moved`       | the name left this contract version through a dual-signed move; look it up in the successor |
| `not-ready`   | the tracker is not ready to answer safely; try later or another server                      |

`listed` is true while the name is for sale: the seller still holds it, and the name may change hands. Say
so before sending. A tag you do not know is a refusal.

Never fall back. If a name will not resolve, say so and stop. Do not send to a similar name, to a cached one
or to the raw input.

## A name for an address

```ts
const p = await kns.primaryNameFor('kaspatest:qz…')
p.name // 'bob.kas', or null
```

An owner says which of their names to show by setting the on-chain primary flag. No flag means no name: show
the address. This package never picks a name the owner did not choose. With a node, only a flagged name the chain
confirms is shown, and the newest confirmed one wins.

## Names

A name is `label.kas`, or `sub.label.kas` for a subdomain, up to 36 levels down. Every label is normalized
with ENSIP-15, the rule legacy KNS applied, and may hold up to 255 code points; `kas` is an ordinary label.
`Alice.KAS`, `alice.kas` and fullwidth `ＡＬＩＣＥ.kas` are one name. A subdomain is a name of its own, with
its own holder, and resolves like any other.

```ts
kns.normalize(' Alice.KAS ') // throws: a space is not part of a name
kns.normalize('Alice.KAS') // 'alice.kas'
kns.hashOf('blog.alice.kas') // { hash, hashHex, parentHash, level: 1, root: 'alice', … }
kns.classify('Blog.Alice.kas') // { kind: 'subdomain', name: 'blog.alice.kas', level: 1, parent: 'alice.kas', … }
kns.display(record) // { text: 'alice.kas' | '3c6c3b18…e172', kind, nonAscii, legacy }
```

Show the standard spelling, never what was typed. Show a name only when it hashes to the record; `display`
does that and falls back to a shortened hash. A name beyond `a-z 0-9 -` can look like something else, and
`nonAscii` says so. An old name moved over from the inscription registry carries `legacy`.

## Availability and price

```ts
await kns.available('alice.kas') // true when the name can be registered now
await kns.lookup('alice.kas') // free | taken | listed | undescribed | moved | not-ready
kns.quote('alice.kas') // { feeSompi: 3500000000n, lockedSompi: 180000000n, totalToFund, tier: 5, … }
```

`available` asks the tracker for every interval under the first byte of the hash and picks the covering one
itself, so the tracker never learns which name you are about to register. `lookup` tells the cases apart,
and does tell the tracker the name. A tracker's missing record never means free: `undescribed` is a
registered name the tracker cannot describe.

`quote` prices by code points of the root label, as the contract does: `台北.kas` is two characters, and so is
a flag emoji. Show `feeSompi` on the registration page and the whole breakdown in the confirmation step; test
"can afford" against `totalToFund`, which includes the locked deposits and the network-fee margin.
A subdomain pays the flat 1 KAS subdomain fee (`SUBDOMAIN_FEE_SOMPI`), and the parent's owner locks its
deposits.

## Profiles

```ts
const p = await kns.profileOf('alice.kas')
// { kind: 'verified', profile, cid, canonical, nameMatches, payTo } | none | withheld | unresolved
```

A profile is a JSON document whose sha256 is the name's on-chain `metadata`. The tracker serves it only when
the bytes match. Everything in it is the owner's own entry: show other chains' addresses as "entered by the
owner, unverified", and never pay a profile's address. `payTo` is the on-chain holder. The operator can stop
serving a profile, which is `withheld`. `sanitizeText` strips the direction and zero-width characters a
profile can carry and a name cannot; `isRenderableUrl` keeps `javascript:` out of an `<a href>`.

## Listings and the partner fee

```ts
const page = await kns.listings({ partner: address, sort: 'price_asc' }) // one marketplace's listings, cheapest first
const r = await kns.resolveName('alice.kas') // r.listedPriceSompi, r.partnerFee, r.listedAt
```

A listing can carry a marketplace partner fee, written into the listing when the seller signs it: an address and a
rate of 1 to 1000 basis points (100 = 1%) of the price. Every purchase, through any front end, pays the fee to that
address and the rest of the price to the seller, or the contract refuses it. `partnerFee` is
`{ address, bps, sompi, to }`, null for a listing without one: `address` is the payee to show, `to` the same payee as
an `Owner` (its scheme and 32 bytes), and `sompi` is `floor(price × bps / 10000)` (`partnerFeeSompi`). A record from
the tracker carries the same as `listed_fee_bps`, `listed_fee_sompi`, `listed_fee_to_address`, and `listed_fee_to`
(32 bytes in hex) read by `listed_fee_scheme` (0 Schnorr, 3 P2SH, 133 or 134 ECDSA);
`partnerFeeOf(record, 'kaspatest')` reads them into a `PartnerFee`. `MAX_PARTNER_FEE_BPS` (1000) is the cap,
`PARTNER_FEE_VOUT` (3) the output a purchase pays the partner at, and `formatBps(250)` is `'2.5%'`.

`listings` asks for the names for sale: `partner` is a marketplace's address or `'none'`, and `sort` is a
`ListingSort`, `price_asc`, `price_desc`, `listed_newest` or `listed_oldest` (`LISTING_SORTS`), or any other
`/v1/domains` order. A partner address is checked here before anything is asked: bare hex, `covenant:…` and another
network's address are an `InvalidAddressError`. A tracker that predates the fee ignores `partner` and answers other
names; such a page is refused with an `ApiError` whose `code` is `partner_ignored`. With a node the fee is proven
with the rest of the listing, because it is part of the listing's address; a lineage deployed before the fee lays its
listings out without it, and a proof asks for both layouts. Testnet-10 lineage `4d10952e…`, the one this build
carries, runs the fee, and its tracker serves it.

## Calls

A name argument can be what a person typed. Every call that reaches the network takes a last argument
`{ signal }`.

| Call                                      | Answer                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipientFor(input)`                     | what a typed string pays: `{ kind, address, ownerType, listed, fault?, … }`                                                                       |
| `classify(input)`                         | `address` \| `domain` \| `subdomain` \| `neither`, without the network                                                                            |
| `addressFor(name)`                        | the address to pay, or null                                                                                                                       |
| `resolveName(name)`                       | `{ name, hash, owner, ownerType, payTo, listedPriceSompi, partnerFee, listedAt, primary, legacy, proven, record, … }`, or null                    |
| `resolveMany(names)`                      | `resolveName` for every name                                                                                                                      |
| `resolveHash(hash)`                       | a record by its hash, for a hash you were handed; can reach a withheld name                                                                       |
| `lookup(name)`                            | `free` \| `taken` \| `listed` \| `undescribed` \| `moved` \| `not-ready`                                                                          |
| `available(name)`                         | whether the name can be registered now, asked privately                                                                                           |
| `availableMany(names)`                    | `available` for every name                                                                                                                        |
| `coveringGap(name)`                       | the interval a registration would spend, or `taken`                                                                                               |
| `namesOf(owner, query)`                   | one page of an owner's names (`owner: null` for every name)                                                                                       |
| `namesOfMany(owners, query)`              | one page for each of several owners                                                                                                               |
| `pagesOf(owner, query)`                   | every page, one at a time                                                                                                                         |
| `listings(query)`                         | one page of the names for sale: all, a marketplace's (`partner`), or the ones without a partner fee (`partner: 'none'`), by price or listing time |
| `subdomainsOf(name)`                      | every subdomain under a name, with the tracker's total; check before buying a root                                                                |
| `primaryNameFor(address)`                 | the one name to show, or null                                                                                                                     |
| `primaryNamesFor(addresses)`              | `primaryNameFor` for every address                                                                                                                |
| `profileOf(name)`                         | the profile as the tracker checked it, or why there is none                                                                                       |
| `history(name, { order, limit, cursor })` | what happened to a name, oldest first unless `order: 'desc'`; `next_cursor` pages it; `available: false` is a normal answer                       |
| `status()`                                | `/health` plus `sameRegistry` and `caughtUp`: whether the index is under a minute behind the chain                                                |
| `quote(name)`                             | what registering costs, in sompi                                                                                                                  |
| `verify(record)`                          | prove a record you hold against the node                                                                                                          |
| `isRegistered(name)`                      | whether the chain holds an anchored claim, with no tracker                                                                                        |
| `normalize(name)`, `hashOf(name)`         | the standard spelling, the hash                                                                                                                   |
| `display(record)`                         | what to show for a record                                                                                                                         |

Under the client are the derivations themselves, exported for a program that wants one piece: `parseName`,
`hashOf`, `nameMatchesHash`, `checkNewName`, `encodeDomainState`, `encodeListingState`, `encodeListingStateV2` (the
layout of a lineage deployed before the partner fee), `Registry` (`claimAddress`, `domainAddress`,
`listingAddress`, `listingAddresses`), `MAX_PARTNER_FEE_BPS`, `PARTNER_FEE_VOUT`, `partnerFeeSompi`, `partnerFeeOf`,
`partnerFeeFromState`, `partnerFromAddress`, `formatBps`, `ownerFromAddress`, `ownerAddress`, `parseRecipient`,
`encodeAddress`, `decodeAddress`, `manifestDigest`, `checkIntegrator`, `pickCoveringGap`, `cidOf`,
`verifyProfileBytes`, `feeTier`, `primaryOrder`, `verifyHint`.

## What a node adds

Give the client a node, and every record is proven against the chain before you see it. The owner lives
inside the covenant state and the chain stores only a hash of it, so the client rebuilds the address that
state implies and asks the node what sits there. A UTXO carrying this deployment's anchor id at that
address proves every field of the record at once; the live claim must carry the anchor too and come from
the same transaction.

| Call                         | Without a node       | With a node                                             |
| ---------------------------- | -------------------- | ------------------------------------------------------- |
| `recipientFor`, `addressFor` | the tracker's word   | a refuted record throws `RefutedError`                  |
| `resolveName`, `resolveHash` | `proven: null`       | `proven: true` or `false`                               |
| `lookup`, `available`        | the tracker's word   | `free` only once the chain shows no anchored claim      |
| `primaryNameFor`             | the tracker's winner | only a confirmed flagged name, newest first by the node |
| `verify`, `isRegistered`     | throw `NodeError`    | the answer                                              |

```ts
import { Kns, WrpcJson, fromWrpc, fromWasm } from '@knsdomains/sdk'

const rpc = await WrpcJson.connect('wss://node.example/kaspa/testnet-10/wrpc/json')
const kns = new Kns({ network: 'testnet-10', node: fromWrpc(rpc, { network: 'testnet-10' }) })
// or, with the rusty-kaspa wasm SDK already in the page:
const other = new Kns({ network: 'testnet-10', node: fromWasm(() => rpcClient) })
```

- `WrpcJson.connect(url)` is this package's own connection to a node's JSON wRPC endpoint (`/wrpc/json`),
  over the platform `WebSocket`: `call(method, params)`, `subscribe(scope)` with `onNotification`,
  `serverInfo()`, `onClose` and `close()`; every call has a timeout and takes `{ signal }`. `fromWrpc` makes
  a node port of it and checks once, at the first ask, that the node is on the network and runs
  `--utxoindex`. Node 22 has a global `WebSocket`; another one is passed as `WebSocket`.
- `fromWasm` takes the rusty-kaspa wasm SDK's `RpcClient`, connected, from a release of v2.0.0 or newer.
  The npm packages `kaspa` and `kaspa-wasm` are from 2023, know no covenant ids, and are refused with a
  `NodeError` rather than answering `false` to everything.
- `fromWrpcJson` takes a JSON-RPC transport of your own.
- `fromGrpc` takes a function that puts one `GetUtxosByAddressesRequestMessage` on kaspad's gRPC
  `MessageStream` and answers with the response; the stream, the client and the proto loader are yours. Load
  the proto with `defaults: true`. kaspad sends `covenant_id: ""` for a plain output, which reads as no
  covenant, as kaspad's own client reads it; a field missing altogether reads as a client that predates
  covenant ids, and is refused.
- Or pass anything shaped `{ getUtxosByAddresses(addresses, { signal }) }` answering
  `{ address, covenantId, transactionId, index, blockDaaScore }[]`. The node needs `--utxoindex`.

## Options

```ts
import { Kns, fromWasm } from '@knsdomains/sdk'

new Kns({
  network: 'testnet-10', // which bundled registry; see DEPLOYMENT_NETWORKS
  anchor: '4d10952e', // which lineage of it, one this build carries; default the newest bundled
  manifest: integratorJson, // a deployment this package does not carry, in place of one it does
  api: 'https://gap-tn10.knsdomains.org', // the tracker base, without /v1; null leaves only offline calls
  node: fromWasm(() => rpcClient), // a rusty-kaspa wasm SDK RpcClient, or another node port; no default
  fetch: myFetch, // defaults to the global one
  timeoutMs: 20_000, // the default; null waits for ever
  concurrency: 6, // API requests in flight at once in a batch call
  verifyRegistry: 'lazy', // compare the tracker's manifest_digest with the bundled one before the first answer
})
```

A registry is identified by its network and its lineage anchor, never by the network alone: a testnet
lineage is replaced every few days and every address moves with it. Every manifest is built in and none is
fetched, so a tracker can never supply the identity you judge that same tracker by. Before the first API
answer is used, the client reads `/health` once and refuses a tracker whose `manifest_digest` is not the
bundled one with `RegistryMismatchError`. There is no mainnet entry until a mainnet lineage exists, and no
other network's host is ever borrowed.

The `api` base is the host without the version segment: pass `https://gap-tn10.knsdomains.org`, not
`https://gap-tn10.knsdomains.org/v1`; the constructor refuses the second one.

## Errors

Everything this package throws extends `KnsError`, with one exception: a call you cancel rejects with the
reason you aborted with. `@knsdomains/sdk-tx` throws these too, and its own `KnsTxError` extends the same base, so one
`catch` on `KnsError` covers both packages.

| Error                   | When                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `InvalidNameError`      | the input cannot be a name; `message` says why                                             |
| `InvalidAddressError`   | not an address, not one on this network, or a recipient given as bare hex                  |
| `RefutedError`          | the node refutes what the tracker named; `reason` says which check failed                  |
| `NodeError`             | the client cannot ask the node, you gave none, or the node client is blind to covenant ids |
| `ApiError`              | the API refused or answered something unusable; branch on `code`, never on `message`       |
| `RegistryMismatchError` | the API serves a different registry                                                        |
| `TimeoutError`          | the call outlived `timeoutMs`                                                              |
| `ConfigError`           | the options do not describe a usable registry, or a call needs the API and `api` is null   |
| `WasmApiError`          | thrown by `@knsdomains/sdk-tx`'s `new KnsTx`: the wasm module speaks another API version   |

`ApiError.code` is the API's own reason: `bad_request`, `not_found`, `conflict`, `retired`, `rate_limited`,
`content_withheld`, `internal`, `upstream_failed`, `not_ready`. A code from a newer server arrives as itself.
`partner_ignored` is this package's: a `partner` page holding a record that is not a listing paying that partner,
which is what a tracker that predates the partner fee answers.
A refusal the API did not label, such as a plain-text overload answer or a transport failure, carries no
code at all.

Numbers in sompi and DAA scores are `bigint` everywhere, read exactly from the wire even past 2^53.
`formatKas` and `parseKas` convert.

## What this package leaves out

It reads and never writes. Nothing here builds, signs or sends a transaction, holds a key, or loads a wasm
module; `@knsdomains/sdk-tx` does that. It does not pin profiles, mirror snapshots, enumerate gaps for a registry,
cache answers or retry: owners change, so ask again before you send. It carries one lineage per bundled
network and refuses the rest.
