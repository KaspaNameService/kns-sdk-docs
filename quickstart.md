# KNS quickstart for wallets

Each task a wallet needs, as one short recipe. The [wallet integration guide](wallet-integration.md) has the details,
and [`examples/wallet`](examples/wallet) runs these recipes as scripts. `@knsdomains/sdk` reads the `.kas` registry
and needs no key, node or wasm. `@knsdomains/sdk-tx` writes through your wallet's signer, over `@knsdomains/wasm`, the
contract module. KNS runs on **testnet-10** (lineage `4d10952e`); mainnet is not deployed yet. Amounts are `bigint`
sompi (1 KAS = 100,000,000 sompi); `formatKas` and `parseKas` convert.

## 1. Install

```bash
npm init -y                # a new project
npm pkg set type=module    # the packages are ES modules
npm install --save-exact @knsdomains/sdk@0.1.0-tn10.4d10952e @knsdomains/sdk-tx@0.1.0-tn10.4d10952e
```

- `@knsdomains/wasm` comes with `@knsdomains/sdk-tx`, at the exact version it was tested with. Reads alone need only
  `@knsdomains/sdk`. The version names the lineage: a new lineage is a new version of both. Keep `--save-exact`:
  versions of two lineages do not sort by date, so a `^` range could take another lineage's build.
- ES modules only (`"type": "module"`, or `.mjs` files); Node 22.12 or later, or a browser through a bundler.
- Vite 6 or 7 dev server: add `optimizeDeps: { exclude: ['@knsdomains/wasm'] }` to `vite.config`, or it loses the
  `.wasm`. Vite 8 needs nothing, and the line does no harm there.
- Manifest V3: add `'wasm-unsafe-eval'` to the CSP ([guide, section 3](wallet-integration.md#a-chrome-extension-manifest-v3)).
- No access to the npm registry: KNS can send the three package files
  ([guide, Getting the packages](wallet-integration.md#getting-the-packages)).

## 2. Setup

Your wallet implements `KnsSigner`, then makes the reader and the writer. The package hands `sign` a finished
transaction and the inputs to sign, and checks every signature that comes back before it sends anything:

```ts
import { Kns } from '@knsdomains/sdk'
import { load } from '@knsdomains/wasm' // Node: import { loadNode } from '@knsdomains/wasm/node'
import { type KnsSigner, KnsTx, accountIdentity, assertSignableDocument } from '@knsdomains/sdk-tx'

declare const keyring: { address: string; publicKey: string; signHash(hash: string, scheme: string): Promise<string> }

const identity = accountIdentity(keyring.address, keyring.publicKey, 'My Wallet') // publicKey: compressed, 66 hex
const signer: KnsSigner = {
  id: 'my-wallet',
  name: 'My Wallet',
  network: 'testnet-10',
  address: keyring.address, // kaspatest:…
  ...identity, // owner, ownerScheme, ownerPubkey
  async sign(safeJson, signInputs) {
    const indexes = signInputs.map((s) => s.index)
    const doc = assertSignableDocument(safeJson, indexes, 'My Wallet') as { inputs: { signatureScript?: string }[] }
    for (const s of signInputs) {
      if (s.sighashType !== 1 || s.scheme !== identity.ownerScheme) throw new Error('not SIGHASH_ALL for this account')
      doc.inputs[s.index]!.signatureScript = `41${await keyring.signHash(s.sighash, s.scheme)}01`
    }
    return JSON.stringify(doc) // never broadcast: the package sends
  },
}

const kns = new Kns({ network: 'testnet-10' }) // the reader; the KNS tracker is built in
const tx = new KnsTx({
  kns,
  wasm: await load(), // Node: await loadNode(). 8.9 MB: load it when a name screen opens
  nodeUrl: 'wss://node.example/kaspa/testnet-10/wrpc/borsh', // a testnet-10 node: see below
  signer,
})
await tx.status() // refuses here if the module and this build disagree
```

- `signHash` answers 64 bytes in hex: BIP-340 Schnorr, or compact low-S ECDSA over the hash as given (no prehash).
  `publicKey` is the compressed key, 66 hex, for a Schnorr account too: `accountIdentity` refuses an x-only one.
- The wallet also signs the name's covenant input, which is not at its address: `tx.probeSigner()` checks that. In
  production, recompute each `sighash` from `safeJson` and refuse a mismatch, as [`examples/wallet/signer.mjs`](examples/wallet/signer.mjs)
  does ([Signing KNS transactions](wallet-signing.md)).
- `nodeUrl`: a testnet-10 node over Borsh wRPC, with `--utxoindex`. `publicNode` asks the Kaspa resolvers for a public
  one: [guide, section 8](wallet-integration.md#8-nodes), [`examples/wallet/public-node.mjs`](examples/wallet/public-node.mjs).
- A server or a bot under Node may pass `privateKey` instead, never in a browser ([guide, 6.2](wallet-integration.md#62-your-signer)).

## 3. Send to a name

```ts
const r = await kns.recipientFor('alice.kas') // what the user typed: a name, a subdomain or an address
if (r.kind === 'neither') show('Not a .kas name or a Kaspa address')
else if (r.kind === 'address') show(`Pay ${r.address}`)
else if (r.address === null) show(`${r.name} cannot be paid: ${r.fault}`)
else show(`Pay ${r.name}: ${r.address}`)
```

- Pay `r.address` and nothing else; when a name does not resolve, stop. Show `r.name`, the standard spelling, and
  resolve again right before signing. Warn on `ownerType: 'p2sh'` (a multisig) and on `listed` (for sale).
- Give the reader a node (`node: fromWrpc(rpc, …)`) and every answer is proven on chain: `r.proven` is `true`, and
  a contradiction throws `RefutedError` ([guide, section 4](wallet-integration.md#proving-answers-against-the-chain)).

## 4. Show a user's name

```ts
const primary = await kns.primaryNameFor(address) // the name the holder chose to show
show(primary.name ?? address)

const page = await kns.namesOf(address, { limit: 50 }) // the next page: { cursor: page.next_cursor }
for (const record of page.domains) show(kns.display(record).text)
```

- No chosen name: show the address, never another name it holds. `primaryNamesFor(addresses)` answers many at
  once. Cache for minutes: a transfer or a sale clears the choice.
- `display` shows a name only when it hashes to the record, and a short hash otherwise. Flag `nonAscii` names.

## 5. Check a name

```ts
import { formatKas } from '@knsdomains/sdk'

const free = await kns.available('alice.kas') // asks by hash prefix: the tracker never learns the name
const q = kns.quote('alice.kas') // local, no request
show(free ? 'Available' : 'Taken', `${formatKas(q.feeSompi)} KAS`, `wallet needs ${formatKas(q.totalToFund)} KAS`)
```

- Fees on testnet-10, by length in code points: 1 or 2, 4,200 KAS; 3, 2,100 KAS; 4, 525 KAS; 5 or more, 35 KAS.
  Show what `quote` answers, not this list. `台北.kas` is 2 code points, and so is a flag emoji.
- `kns.lookup(name)` also tells `listed` from `taken`, with the price, but it tells the tracker the name.

## 6. Register a name

```ts
import { formatKas } from '@knsdomains/sdk'

const q = kns.quote('alice.kas')
if (!(await kns.available(q.name))) return show(`${q.name} is taken`)
const lines = [`Fee ${formatKas(q.feeSompi)} KAS`, `Locked with the name ${formatKas(q.lockedSompi)} KAS`]
if (!(await confirm(`Register ${q.name}`, ...lines, `Your wallet needs ${formatKas(q.totalToFund)} KAS`))) return
const done = await tx.registerName(q.name, { onProgress: (p) => show(p.phase) }) // checking, signing, broadcasting
await tx.waitForIndex(q.name, done.txid) // the tracker shows it a few seconds later
```

- `alice.kas` needs 37 KAS in the wallet: the 35 KAS fee, 1.8 KAS of deposits that stay with the name, and a
  0.2 KAS allowance for the network fee (about 0.02 KAS is used). Fund a little more than `totalToFund`.
- One transaction, one signer prompt, no plan step: `registerName` checks everything again before it prompts.
  The first registration accepted wins. Refused before signing: `taken`, `registration-closed`, `insufficient-funds`.

## 7. Transfer a name

Every spend of a name you hold is a plan, then `submit`. The plan reads the name, has the module confirm it on
the node and checks the rules, with nothing signed. Show its `summary`, then submit.

```ts
const to = 'kaspatest:qr…' // the recipient's address
const plan = await tx.planTransfer('alice.kas', to) // { profile: 'keep' | 'clear' | cid }; 'keep' by default
if (plan.recipient?.warn) show('The recipient is a multisig or a contract.')
if (!(await confirm(plan.summary))) return // 'send alice.kas to kaspatest:qr…'
const result = await tx.submit(plan)
if (result.warnings.length) show(...result.warnings) // for a multisig or a contract: what holding the name means
await tx.waitForIndex(plan.name, result.txid)
```

- The wallet pays the network fee only, about 0.015 KAS. A recipient is an address; bare hex is refused.
- Plan right before the prompt: a plan older than the name's state is refused. `tx.transfer`, `tx.setPrimary`,
  `tx.list` and the other one-step calls plan and submit together, for screens that show nothing in between.

## 8. Primary name and profile

Show each plan's `summary` first, as in section 7, and let `waitForIndex` return before the next spend of a name.

```ts
const plan = await tx.planSetPrimary('alice.kas') // or, later: tx.planClearPrimary('alice.kas')
if (!(await confirm(plan.summary))) return // 'make alice.kas the primary name of kaspatest:…'
const result = await tx.submit(plan)
await tx.waitForIndex(plan.name, result.txid)
```

A profile is pinned on the tracker, then the name points at it:

```ts
const body = JSON.stringify({ display: 'Alice', name: 'alice.kas', v: 1 }) // canonical: sorted keys, no empty fields
const pin = await fetch('https://gap-tn10.knsdomains.org/v1/pin', { method: 'POST', body })
if (!pin.ok) return show(`Profile not saved (${pin.status})`) // 429: rationed, try in a minute; 400: not canonical
const { cid } = (await pin.json()) as { cid?: string }
if (!cid?.startsWith('bafkrei')) return show('Profile not saved: the tracker answered no file')
const plan = await tx.planUpdateProfile('alice.kas', cid) // null clears the profile
if (!(await confirm(plan.summary))) return // 'point the profile of alice.kas at …'
const result = await tx.submit(plan)
await tx.waitForIndex(plan.name, result.txid)
```

- The primary name is what section 4 shows for the holder's address. A profile is the holder's own entry: show its
  text through `sanitizeText` and links through `isRenderableUrl`, and never pay an address from it. Its fields and
  canonical form: [guide, section 6.5](wallet-integration.md#65-write-a-profile).

## 9. List for sale, and cancel

```ts
import { parseKas } from '@knsdomains/sdk'
import { partnerFeeWaivedText } from '@knsdomains/sdk-tx'

const partnerFee = { address: 'kaspatest:qr…', bps: 250 } // optional: 2.5% of the price to your marketplace
const plan = await tx.planList('alice.kas', parseKas('25'), { partnerFee })
if (plan.partnerFeeWaived) show(partnerFeeWaivedText(plan.partnerFeeWaived))
if (!(await confirm(plan.summary))) return // '…, of which 0.625 KAS (2.5%) is a partner fee …'
await tx.submit(plan)
```

- A price is at least 0.2 KAS. A partner fee is 1 to 1000 basis points of the price (10% is the cap), paid out of
  it to that address on every sale, whoever builds the purchase. Leave `partnerFee` out for none.
- **A fee under 0.2 KAS is waived, not refused**: the listing carries no fee, and `partnerFeeWaived` and the summary
  say so. Tell the seller before they sign. At 10% the lowest price that keeps a fee is 2 KAS; at 1%, 20 KAS.
- A listed name cannot be transferred or given a profile or subdomains, and its fee cannot change. Cancel first:
  `planCancel(name)`, a plan like any other.

## 10. Buy a listed name

```ts
import { formatKas } from '@knsdomains/sdk'

const r = await kns.resolveName('alice.kas')
if (r === null || r.listedPriceSompi === null) return show('Not for sale')
const plan = await tx.planBuy('alice.kas', { expectedPriceSompi: r.listedPriceSompi }) // the price the buyer saw
if (!(await confirm(plan.summary, `You pay ${formatKas(plan.spendsSompi)} KAS and the network fee`))) return
await tx.submit(plan)
```

- `planBuy` refuses, with nothing signed, a price that is not the one the buyer saw, and a buyer who is the seller.
- Pass the name as a string. `resolveName()` and `listings()` give `name: string | null` (null when the tracker has no
  spelling for the hash), so check it before handing it on.
- The buyer pays the price, and a partner fee comes out of it (`plan.sale.sellerSompi`, `plan.sale.partnerSompi`).
  The sale clears the name's profile and primary flag.

## 11. Mint a subdomain

```ts
const plan = await tx.planMintSubdomain('alice.kas', 'pay', 'kaspatest:qr…') // pay.alice.kas, for that address
if (!(await confirm(plan.summary))) return // '… locking 1.8 KAS of deposits and paying the 1 KAS subdomain fee'
await tx.submit(plan)
```

- The parent's holder pays 2.8 KAS (`plan.spendsSompi`) and the network fee, and cannot take the subdomain back.
  One that exists is refused before the plan, with code `taken`.

## 12. Errors

Everything the packages throw extends `KnsError`. A write refuses with `KnsTxError`: branch on its `code`, never
on `message`, and never retry by yourself when `afterSigning` is true.

```ts
import { KnsError } from '@knsdomains/sdk'
import { KnsTxError } from '@knsdomains/sdk-tx'

try {
  await tx.submit(plan)
} catch (e) {
  if (!(e instanceof KnsError)) throw e
  if (e instanceof KnsTxError && e.afterSigning) show('This may have been sent. Checking…', e.sentTxid)
  else if (e instanceof KnsTxError) show(e.code, e.message)
  else show(e.message) // a read: InvalidNameError, ApiError, RegistryMismatchError, …
}
```

| `code`               | Meaning                                                                  | What the wallet does                     |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `taken`              | somebody holds the name or the subdomain                                 | say so; nothing was signed               |
| `insufficient-funds` | the account cannot pay; the message has the breakdown                    | show what is missing                     |
| `wallet-declined`    | your signer threw, or signed nothing for an input                        | nothing was sent                         |
| `signature-invalid`  | a signature does not verify: wrong key, hash or high-S                   | a bug in your signer; nothing was sent   |
| `lost-race`          | somebody spent the same registry output first                            | try again; check `available` first       |
| `not-accepted`       | the module sent `sentTxid` and did not see it accepted                   | do not resend: look it up first          |
| `node-unreachable`   | the node did not answer                                                  | use another node ([section 2](#2-setup)) |
| `unknown`            | a product rule refused: "… Nothing was signed"                           | show your own message; log this one      |
| `unknown`            | `waitForIndex` timed out: the transaction is done, the tracker is behind | not a failure: look again later          |

`hint-refuted`: the tracker is behind, often just after a spend of the same name; try again in a moment. Also
`registration-closed` and `not-registered`; every code and read error: [guide, section 7](wallet-integration.md#7-errors).
`RegistryMismatchError` means the tracker serves another lineage: turn name features off until the packages are updated.

## 13. Testnet and support

Testnet-10: tracker <https://gap-tn10.knsdomains.org>, site <https://tn10.knsdomains.org>. Support: `<CONTACT_EMAIL>`
