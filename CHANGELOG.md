# Changelog

What changed for an integrator in each release. Each package also ships its own `CHANGELOG.md`.

- [`@knsdomains/sdk`](#knsdomainssdk)
- [`@knsdomains/sdk-tx`](#knsdomainssdk-tx)
- [`@knsdomains/wasm`](#knsdomainswasm)

## @knsdomains/sdk

### 0.1.0-tn10.4d10952e

Published under the npm scope `@knsdomains`; earlier builds were named `@kns/*` and were handed out as files.

The marketplace partner fee, for the testnet-10 lineage `4d10952e…` deployed on 2026-11-12, the first deployed from
the contracts that carry it. Its tracker serves the fee fields and the listing queries below.

- A listing's partner fee: `DomainRecord`, `SubdomainItem` and `HistoryEvent` (on `listed` and `sold`) have
  `listed_fee_bps`, `listed_fee_sompi`, `listed_fee_to`, `listed_fee_scheme` and `listed_fee_to_address`, present only
  for a listing with a fee, and `DomainRecord` has `listed_at`, when the listing was made. `listed_fee_sompi` and
  `listed_at` read as bigints. `Resolved` answers `partnerFee` (`{ address, bps, sompi, to }`, null for none) and
  `listedAt`; a record whose fee fields disagree with each other is an `ApiError`.
- `DomainsQuery` takes `partner` (an address, or `'none'`) and the sorts `price_asc`, `price_desc`, `listed_newest`
  and `listed_oldest`: `ListingSort`, which `DomainsSort` includes, all four in `LISTING_SORTS` (a `readonly
  ListingSort[]`). `Kns.listings(query)` asks for listings only; `namesOf` refuses a partner address that cannot be
  paid on this network (bare hex, `covenant:…`, another network) with `InvalidAddressError` before asking, and sends
  it in its standard spelling. A `partner` page holding a record that is not a listing paying that partner, which a
  tracker that predates the fee answers, is refused with an `ApiError` whose `code` is `partner_ignored`, a new
  `ApiErrorCode`: a caller tells it from a transport failure, which carries no code.
- The listing state slot carries the fee after the price (resolution vectors v3, `LISTING_STATE_LEN` 294):
  `ListingState.partnerFee`, `encodeListingState`. `encodeListingStateV2` and `LISTING_STATE_V2_LEN` (243) are the
  layout of a lineage deployed before the fee, which `Registry.listingAddresses` and `hintAddresses().states` add for
  a listing without one, so a proof finds a listing under either. `hintFromRecord` reads the fee.
- `MAX_PARTNER_FEE_BPS` (1000), `PARTNER_FEE_BPS_DENOMINATOR`, `PARTNER_FEE_VOUT` (3), `partnerFeeSompi`,
  `partnerFeeFromState`, `partnerFeeOf`, `partnerFromAddress` and `formatBps`.
- The conformance corpus is `names.json`, `resolution.v2.json` and `resolution.v3.json`; `npm run generate --
  <checkout> --vectors-only` takes it without a lineage.

### 0.1.0-tn10.d88eedaa

For the testnet-10 lineage `d88eedaa…` deployed on 2026-10-31, the first with one-transaction registration.

- The manifest has no `commit_delay_blocks`, and `Registry` no `commitDelayBlocks`: there is no commit to wait
  for.
- `quote` sets aside one network-fee allowance (0.2 KAS, `allowanceSompi`), not two: a 35 KAS name needs 37 KAS.
- A subdomain quotes the 1 KAS subdomain fee (`SUBDOMAIN_FEE_SOMPI`, new) as its `feeSompi`, and its
  `totalToFund` includes it. `SUBDOMAIN_MIN_CHANGE_SOMPI` (2 KAS): a mint refuses coins that would leave between
  0.2 and 2 KAS of change.
- The allowance's leftover comes back only as change over 0.2 KAS (`MIN_CHANGE_SOMPI`); the docs said it always
  did.

### 0.1.0-tn10.da751585

The first read-only client, for the testnet-10 lineage `da751585…` deployed on 2026-10-21.

- `Kns`: `recipientFor`, `classify`, `addressFor`, `resolveName`, `resolveMany`, `resolveHash`, `lookup`,
  `available`, `coveringGap`, `namesOf`, `pagesOf`, `subdomainsOf`, `primaryNameFor`, `primaryNamesFor`,
  `profileOf`, `history`, `status`, `quote`, `verify`, `isRegistered`, `normalize`, `hashOf`, `display`.
- `Api.history` takes `order`, `limit` and `cursor` and answers `next_cursor`; `Api.limo` asks the gateway's
  decision for a hostname.
- Pure TypeScript derivations pinned by covenant-domain's `names.json` and `resolution.v2.json`: ENSIP-15
  normalization and the hash fold, the domain, listing and claim state slots and their P2SH addresses, the
  owner schemes and Kaspa addresses, the manifest digest, the template hash and the raw CID.
- A `Node` port with `fromWasm`, `fromWrpcJson` and `fromGrpc` adapters, and `verifyHint`, the resolution spec's
  step 5a. `fromGrpc` reads kaspad's proto3 answer as kaspad's own client does: `covenant_id: ""` is a plain
  output, and a missing field is a client that predates covenant ids, refused unless the same answer carries
  a covenant id.
- `WrpcJson`, the package's own connection to a node's JSON wRPC endpoint (`connect`, `call`, `subscribe`,
  `onNotification`, `serverInfo`, `close`), and `fromWrpc`, a node port over it that checks the network and
  `--utxoindex` once.
- `availableMany` and `namesOfMany`; `history` pages with `order`, `limit` and `cursor`; `status()` answers
  `caughtUp`, whether the index is under `CAUGHT_UP_SECS` (60) behind the chain.
- `examples/browser.html` runs every read call in a browser against the live tracker;
  `tests/contract.test.ts` holds the wire types to answers a real tracker gave (`tools/record-wire.mjs`).
- The tracker's `manifest_digest` is compared with the bundled one before the first API answer is used.
- `bigint` for every sompi and DAA value, read exactly from the wire.

## @knsdomains/sdk-tx

### 0.1.0-tn10.4d10952e

Published under the npm scope `@knsdomains`; earlier builds were named `@kns/*` and were handed out as files.

The marketplace partner fee, over `@knsdomains/wasm` 9.0.1-src.f785b05 (`kns-wasm-api-v9`, built from the contracts that
carry the fee), for the testnet-10 lineage `4d10952e…` deployed from those contracts on 2026-11-12. The live write
test sells a name there with a 10% fee and finds the seller paid at output 1 and the partner at output 3.

- `planList(name, priceSompi, { partnerFee: { address, bps } })` and `list(…)` write a marketplace's fee into the
  listing. Over 1000 basis points, 0, a rate that is not a whole number, and an address that cannot be paid (bare
  hex, `covenant:…`, another network) are refused before anything is asked.
- A fee that comes to less than `MIN_PARTNER_FEE_SOMPI` (0.2 KAS) is left out, not refused: the listing carries no
  fee, the summary says "partner fee … is below the 0.2 KAS minimum, so this listing has no fee", and the plan has
  `partnerFeeWaived` (`{ requestedBps, feeSompi, minimumSompi }`). `list` answers it too, beside the module's
  `ListResult` (`Listed`), whose own `partner_fee_waived` is always null through this package. The rule is
  `partnerFeeTerms`, applied before the module is asked, with covenant-domain's constant, which the tests compare
  with the module's `deployment_status().constants.min_partner_fee_sompi`; the module applies the same rule and
  answers `partner_fee_waived` in the same shape. The contract has no minimum: a minimum in the contract would be
  frozen for the lineage, and the network's mass limits may change.
- A listing, a cancel and a buy plan have `sale`: the price, the listing's `partnerFee`, and the seller's and the
  partner's parts. `planBuy`'s summary names both parts; `spendsSompi` is the price, or, for a listing written
  elsewhere with a part under 0.2 KAS, what the module pays with that part raised to 0.2 KAS (`purchasePayments`,
  which reads only the fee's rate: it takes a `PartnerFee` or just `{ bps }`).
- `planCancel`, `planBuy` and the multisig `cancel` pass the listing's own fee to the module, which needs it to find
  the listing; the multisig `list` takes `partnerFee` and reports a waived one as `build.partnerFeeWaived`.
- `VerifiedDomain` has `partnerFee` and `listedAt`; a record whose fee fields disagree is `hint-refuted` before the
  module is asked.
- v9 types: `partner_fee_address` and `partner_fee_bps` on `list`, `buy` and `cancel`; the `listing` result's
  `partner_fee_address`, `partner_fee_bps`, `partner_fee_sompi` and `seller_gets_sompi`; the buy's
  `partner_fee_vout`, `partner_fee_sompi` and `partner_fee_address`; `resolve`'s `listed_fee_*`.
- `MIN_LISTING_SOMPI` and `MAX_LISTING_SOMPI` keep their values and move beside the partner fee rule.

### 0.1.1-tn10.d88eedaa

Error codes a wallet can branch on, for the same lineage `d88eedaa…`, over `@kns/wasm` 8.0.1-src.e539eeb (a failed
load of the module is retried, not kept).

- New code `taken`: `registerName` and `MultisigClient.register` of a name somebody holds, and
  `planMintSubdomain` (and `mintSubdomain`) of a subdomain that exists. These answered `not-registered`, or, for a
  subdomain, built a plan and then failed inside `submit` with `unknown`. The subdomain is now checked before the
  plan, with nothing signed. A gap lookup that lands on a registered name reads as `taken` too.
- Every refusal the module gives a signature the wallet returned is `signature-invalid`: one that does not match
  the hash under the account's key, one that is not a Schnorr or ECDSA signature, the wrong number of them, and a
  returned document it cannot read them from. These answered `unknown`. They are no longer marked `afterSigning`,
  because the module checks every signature before it sends: that refusal sent nothing.

### 0.1.0-tn10.d88eedaa

Registration is one transaction (covenant-domain b74c7e1), over `@kns/wasm`
8.0.0-src.e539eeb (`kns-wasm-api-v8`), for the testnet-10 lineage `d88eedaa…` deployed on 2026-10-31.

- `registerName` runs the module's `register` op: one transaction, one wallet prompt. Its phases are
  `checking`, `signing`, `broadcasting`, `done`, and it answers `{ name, txid, feeSompi, warnings, result }`.
  It also takes a `profile` to register the name with. Before the prompt it checks the opening score, that the
  name is free, and that the module spells the name as `@kns/sdk` does.
- Removed with commit/reveal: `resumeRegistration`, `reclaim`, `pendingStatus`, `pending()`, the `store`,
  `node` and `waitForLock` options, `MemoryPendingStore`, `LocalStoragePendingStore`, `JsonlPendingStore` and
  `defaultPendingFile` (`@kns/sdk-tx/node` keeps `loadNode`), `pendingKey`, `reducePending`, `commitmentOf`,
  `COMMIT_SALT_BYTES`, `KnsTxError.data` and the `too-early` and `commit-send-failed` codes, and the
  multisig `commit`, `reveal` and `reclaim`, replaced by `MultisigClient.register`. The `follower` option
  stays, for `waitForAcceptance`.
- API v8: every builder answer has a required `warnings` list (the module's handover text for a multisig or
  contract holder), typed on each result and handed back by `Registered` and `MultisigBuild`; the subdomain
  answer has `kns_fee_vout` and `subdomain_fee_sompi`; `status().constants` has `fee_allowance_sompi`,
  `subdomain_fee_sompi` and `subdomain_fee_vout` in place of `commit_reveal_delay_blocks` and
  `kns_registration_fee_sompi`.
- A subdomain plan's `spendsSompi` is its three deposits and the 1 KAS subdomain fee.
- A multisig build's `feeSompi` is the signing file's network fee: a registration's answer carries its
  registration fee at the top level under the same name.
- A refusal thrown after the wallet signed (`registerName`, `submit`) has `KnsTxError.afterSigning`, and
  `sentTxid` when the module names the transaction it sent; the module's "was not accepted within" is code
  `not-accepted`, and every lost-race text of the module's (`gap_index::is_lost_race_error`) is `lost-race`, not
  `unknown` or `node-unreachable`.
- `SubdomainResult` and `ListResult` are typed as the module answers them (`child` and `parent`, `listing`).
- The deny list uses the module's entrypoint names (`KNSGapRegistry.split.register`, `.subdomain`,
  `.migrate`, and the `KNSClaim.touchFor…` entrypoints beside each spend), so a disabled entrypoint is refused
  here as it is by the CLI.

### 0.1.0-tn10.da751585

- Fix: a KasWare that had locked itself since it connected refused every signature with "returned no account,
  so it may be locked", because the check before the prompt read `getAccounts()`, which a locked KasWare answers
  with nothing (and so does `requestAccounts()` on a site it is connected to, without a prompt). A locked wallet
  now goes straight to `signPskt`, which opens KasWare's own unlock prompt, and the account is held to the bound
  one as soon as it can be read, before the signature is returned. An account that can be read is checked
  before the prompt, as before.
- Over `@kns/wasm` 6.0.0-src.ed26fae, which carries the multisig fixes (covenant-domain PR #35): the live write test now runs the 2-of-3 multisig round trip to completion on testnet-10 (10 passed); its probe skips the round trip only against an older module.
- Fix: owner-key comparisons used Node's `Buffer`, which a browser does not define, so connecting a wallet (KasWare/Kastle) threw `ReferenceError: Buffer is not defined`. They now use the package's own `toHex`/`fromHex`. The package is browser-only-safe again.

The first transaction client, over `@kns/wasm` 6.0.0-src.41490f1, for the testnet-10 lineage `da751585…`.

- `KnsTx`: `registerName`, `pending`, `resumeRegistration`, `reclaim`, `transfer`, `updateProfile`,
  `setPrimary`, `clearPrimary`, `list`, `cancel`, `buy`, `mintSubdomain`, `describeRecipient`, `domainOf`,
  `probeSigner`, `registrationWindow`, `waitForIndex`, `hash`, `lookup`, `status`.
- `planTransfer`, `planUpdateProfile`, `planSetPrimary`, `planClearPrimary`, `planList`, `planCancel`,
  `planBuy` and `planMintSubdomain` answer a `Plan` (the verified `domain`, the `recipient`, `spendsSompi`, a
  `summary`) with nothing signed, and `submit(plan)` runs it; the one-step calls are the two in a row.
  `SUBDOMAIN_LOCKED_SOMPI` is what a subdomain mint locks.
- `pendingStatus(entry)`: where an unfinished registration stands, `committed`, `revealed`, `spent` or
  `unknown`.
- The salt is stored before a commit is sent; the commitment the module plans is recomputed before the salt
  is stored.
- `KnsSigner` with `kaswareSigner` and `kastleSigner`; `WasmHandle` with typed ops and `KnsTxError` codes;
  `MemoryPendingStore`, `LocalStoragePendingStore` and, under Node, `JsonlPendingStore` on the CLI's file.
- The gap a registration spends is chosen from `/v1/gaps?prefix=`, so the tracker never learns the name.
- `ChainFollower` over `fromRpcClient`, `fromWrpc` (a `WrpcJson` connection from `@kns/sdk`), `fromNodeInfo`
  or `fromKaspaRest`: the DAA score now, a wait for a
  target with what is left, and where a transaction was accepted. `KnsTx` takes a `follower` and waits for
  the commit's time lock through it before the wallet signs the reveal (`waiting` carries `blocksLeft`), and
  `waitForAcceptance(txid)`. `waitForLock: false` signs the reveal right after the commit instead, so both
  wallet prompts come together; a source whose push stream carries no accepted transactions says so with
  `pushesAccepted: false`, and a wait for one is answered null at once.
- Multisig owners: `multisigRedeemScript`, `multisigAddress`, `tx.multisig(redeemScript)` with every spend
  and the registration steps as signing-file builds, and `reviewMultisig`, `signMultisig`, `finishMultisig`,
  `withSignatures` for the co-signers' round trip over the CLI's signing file.
- A live write test (`npm run test:live` with `KNS_LIVE_NODE` and `KNS_LIVE_KEYS`) that registers, probes,
  spends, moves a name through a multisig and back, reclaims and resumes on a real testnet. Confirmed on
  testnet-10 on 2026-10-22: every step but the multisig round trip. That step is gated on covenant-domain
  PR #35 — the deployed `@kns/wasm` (`6.0.0-src.41490f1`) rejects a p2sh session in `apply_deployment`
  before the multisig path — so the test probes the module and skips it until a `@kns/wasm` with the fix is
  bundled.
- `examples/walkthrough.html`: every operation as code, with what it answers and where the wallet prompts.

## @knsdomains/wasm

### 9.0.1-src.f785b05

Published under the npm scope `@knsdomains`; earlier builds were named `@kns/*` and were handed out as files.

The `kns-wasm-api-v9` module rebuilt from covenant-domain `f785b059adee4050da6a493837d789a92096f621`, the head of
`fix/index-binding-guard` (the index and reader fixes) after it merged dev at `62d9b37` (the partner fee, PR #51, and
the post-merge fixes, PRs #53 and #54), merged into dev unchanged by PR #55 (`a6813b6`, the same tree). build.sh's
fingerprint gate passed for the five contracts, which are byte for byte those of `f9da563`, so
`contract_fingerprints` are unchanged. It ships with the testnet-10 lineage `4d10952e…`, deployed from these contracts
on 2026-11-12: given that lineage's values, it derives its manifest digest. The exports and their types are those of
`9.0.0-src.f9da563`; what changed is behaviour, within v9:

- `list`, `buy` and `cancel` (key, wallet and multisig paths) refuse a `partner_fee_address` on another network than
  the session's, which they used to re-spell with the session's prefix (PR #54, docs/versioning.md row 16).
  `@knsdomains/sdk-tx`'s `partnerFeeTerms` already refused it.
- `buy` and `cancel`, given a partner fee that `list` leaves out at that price (under 0.2 KAS), look once at the
  address of the same listing without the fee and refuse at once when the listing is there, saying to drop
  `partner_fee_address` and `partner_fee_bps`. They used to wait about four minutes at the address the fee gives and
  then report no listing. That report now says to drop such a fee, and a failed RPC call is no longer reported as a
  missing listing (PR #54).
- `resolve` reading the claim's transaction (the `block_hash` path) follows docs/resolution-spec.md 5b as PR #55
  rewrote it:
  - Bindings are judged per transaction. A node serves a binding with every bound output and nothing with an unbound
    one, so once any output carries one, an output without one is unbound: an unbound output 0 is not a listing, and
    a name reads as retired only when the node served bindings.
  - `list`'s price, fee scheme and rate, and a name's level, are read as the engine reads a contract's `int`
    argument (`deserialize_i64`; with covenants on, neither minimal pushes nor minimal numbers are required). A
    no-fee listing whose rate is pushed as `[0x80]` or an empty `OP_PUSHDATA1`, which the chain accepts, is read
    instead of lost.
  - A domain is read from the input that made it, not from every input's pushes, and the search is bounded
    (1,000,000 scripts): an input full of 32-byte values that the transaction's author added no longer crowds the
    owner out or makes a call run for minutes.
  - An input spent a domain when the last push of its signature script, an empty one included, is that domain's
    script: the engine runs exactly that as the redeem script. Every input that did is tried, not only the first, so
    an input placed first that pushes the domain's script and ends in `OP_0` no longer hides a listing and makes the
    name read as retired.
  - With bindings, a registration, a purchase or a cancel is read from the input the new domain's binding names: for
    a registration the gap input, whose `KNSGapRegistry.split` binds the domain at output 3.
  - With bindings, an output counts only when its binding names the input being read and carries
    `anchor_covenant_id` (once the session sets it): an output the author bound to that input under a genesis id
    they computed is a copy that only the anchor tells apart.
- The index (the resolver behind `/v1/domain` and `/v1/resolve`) has its half of these fixes from PR #55, among them
  reading a registration only from the gap input at output 3; it is updated apart from this module. `resolve` with
  a `hint`, which is how `@knsdomains/sdk-tx` checks a tracker's record, reads no transaction and is unchanged.
- 8,947,053 bytes (3,876,037 gzipped).

### 9.0.0-src.f9da563

The `kns-wasm-api-v9` module, a local build of covenant-domain `f9da563bf0f21554472f973073f7a98d132b55bf`, the
head of the unmerged branch `feat/listing-partner-fee` (the marketplace partner fee), with build.sh's fingerprint
gate passing for the five contracts. Not published. It replaces the build of `6dbae33`, never published either,
with the same contracts byte for byte. No deployed lineage runs these contracts yet: KNSDomain,
KNSListing and KNSClaim changed (and KNSGapRegistry, which pins the domain template), so from the values of the
bundled testnet-10 lineage `718ad6c6…` it derives four other template hashes and another manifest digest, which
`@kns/sdk-tx` refuses and `tools/check-release.mjs` will not publish. It ships with a lineage deployed from these
contracts.

- v9: `list`, `buy` and `cancel` take `partner_fee_address` and `partner_fee_bps`, the listing's marketplace
  partner fee, which is part of the listing's address (both or neither; 1 to 1000 basis points; a Kaspa address,
  never a covenant id or bare hex). Every `listing` result carries `partner_fee_address`, `partner_fee_bps`,
  `partner_fee_sompi` and `seller_gets_sompi`. `buy`'s `paid_sompi` is the seller's part, the price less the fee,
  and it adds `partner_fee_vout` (3), `partner_fee_sompi` and `partner_fee_address`. `resolve` answers the
  `listed_fee_*` fields of a listing. covenant-domain docs/versioning.md row 16 has the whole list.
- A fee that comes to less than 0.2 KAS is left out of the listing, not refused (the 2026-11-12 decision), as
  `@kns/sdk-tx` leaves it out: every `list` result's `listing` names the fee the listing carries, and
  `partner_fee_waived` beside it is `{ requested_bps, fee_sompi, minimum_sompi }` when a fee was left out, null
  otherwise. `deployment_status().constants` adds `min_partner_fee_sompi` (20000000), `max_partner_fee_bps` (1000)
  and `partner_fee_vout` (3); `@kns/sdk-tx`'s tests hold its own constants to these.
- `resolve` takes a listing only at output 0, on the terms of the domain input's own `list` call, so a decoy output
  in a list transaction no longer makes a live listing read as retired.
- 8,931,250 bytes (3,866,863 gzipped).

### 8.0.1-src.e539eeb

The same module (`kns_wasm_bg.wasm` unchanged, sha256 `dca284dc…`); the entry's loader changed.

- `load()` keeps no failed load. A fetch that was cut off, or bytes that do not compile, used to answer every later
  `load()` and `loadNode()` with the same rejection until the page or the process restarted; the next call now
  tries again. A load that succeeded is still the one instance every call answers.

### 8.0.0-src.e539eeb

The `kns-wasm-api-v8` module built from covenant-domain `e539eebfd06834f80e46319963d74f5c95dee940` (dev; the
tree that deployed testnet-10 lineage `d88eedaa…`), with build.sh's fingerprint gate passing for the five
contracts. The contracts changed, so `contract_fingerprints` are new; the Commit contract is gone.

- v7: registration is one transaction. Op `register` replaces `commit-plan`, `commit`, `reveal` and `reclaim`;
  `deployment_status().constants` drops `commit_reveal_delay_blocks` and adds `fee_allowance_sompi`.
- v8: every builder result has a required `warnings` list; the subdomain result names its fee output
  (`kns_fee_vout` 6, `subdomain_fee_sompi`, 1 KAS); the constants have `subdomain_fee_sompi` and
  `subdomain_fee_vout` in place of `kns_registration_fee_sompi`; the multisig review has no
  `unsigned_slack_sompi`; the wallet pays every network fee. covenant-domain docs/versioning.md row 16 has the
  whole list.

### 6.0.0-src.ed26fae

The same `kns-wasm-api-v6` module rebuilt from covenant-domain `ed26fae588ab5b26dca07bb434cc6074da541cd6` (PR #35), with two multisig fixes and no contract change (the six contract scripts are byte-for-byte those of 41490f1):

- A multisig session (`owner_scheme: "p2sh"` with `redeem_script`) passes `apply_deployment`; it used to be refused as a key with no scheme before the multisig path, so every multisig op failed.
- A multisig answer serializes its u64 fields as bigints. The embedded transaction carries input `sequence` = u64::MAX, which `json_compatible()` refused ("can't be represented as a JavaScript number"). Other ops are unchanged.

Verified on testnet-10: the `@kns/sdk-tx` live write test runs the 2-of-3 multisig round trip to completion (10 passed).

### 6.0.0-src.41490f1

The `kns-wasm-api-v6` module built from covenant-domain `41490f1d01a83e07f5456a1bc084eb0d7110bd4f`, the
build in production for the testnet-10 lineage `da751585…`, with `load`, `loadNode`, a curated entry and
`PROVENANCE.json`, importable as `@kns/wasm/PROVENANCE.json`.
