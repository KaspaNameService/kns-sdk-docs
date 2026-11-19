# Signing KNS transactions

For the engineers who write a wallet's `KnsSigner`
([wallet integration guide, section 6.2](wallet-integration.md#62-your-signer)): exactly what the signer is handed,
what it hands back, and how to recompute the signature hash so the wallet signs only what it hashed itself.

Everything below was checked against the module. [`examples/wallet/sighash.mjs`](examples/wallet/sighash.mjs)
implements the hash as described here, and it gives the module's own `sighash`, byte for byte, for every input of
every kind of KNS transaction on testnet-10: a registration, a transfer, a profile change, setting the primary
name, a listing, a cancel, a buy, a subdomain mint, and an ECDSA account's probe. The example signer
([`examples/wallet/signer.mjs`](examples/wallet/signer.mjs)) recomputes every hash before it signs, and it
registered and transferred names that way, with both schemes.

## What `sign` is handed

`sign(safeJson, signInputs)`. `safeJson` is the finished transaction as kaspa-wasm Safe JSON. Setting a name's
primary flag, with long hex cut short:

```json
{
  "id": "d0b94b635bb7…53fefb",
  "version": 1,
  "inputs": [
    {
      "transactionId": "d7e19741204b…db9641",
      "index": 3,
      "sequence": "18446744073709551615",
      "sigOpCount": 0,
      "computeBudget": 14,
      "signatureScript": "",
      "utxo": {
        "address": null,
        "amount": "60000000",
        "scriptPublicKey": "0000aa202471…cecf87",
        "blockDaaScore": "615390449",
        "isCoinbase": false,
        "covenantId": "4d10952ecec7…a6d915"
      }
    },
    {
      "transactionId": "d7e19741204b…db9641",
      "index": 2,
      "sequence": "18446744073709551615",
      "sigOpCount": 0,
      "computeBudget": 5,
      "signatureScript": "",
      "utxo": {
        "address": null,
        "amount": "60000000",
        "scriptPublicKey": "0000aa20f7d2…094187",
        "blockDaaScore": "615390449",
        "isCoinbase": false,
        "covenantId": "4d10952ecec7…a6d915"
      }
    },
    {
      "transactionId": "d7e19741204b…db9641",
      "index": 5,
      "sequence": "18446744073709551615",
      "sigOpCount": 0,
      "computeBudget": 12,
      "signatureScript": "",
      "utxo": {
        "address": null,
        "amount": "195729392600",
        "scriptPublicKey": "000020580588…b88aac",
        "blockDaaScore": "615390449",
        "isCoinbase": false,
        "covenantId": null
      }
    }
  ],
  "outputs": [
    {
      "value": "60000000",
      "scriptPublicKey": "0000aa202b02…dbb087",
      "covenant": { "authorizingInput": 0, "covenantId": "4d10952ecec7…a6d915" }
    },
    {
      "value": "60000000",
      "scriptPublicKey": "0000aa20f7d2…094187",
      "covenant": { "authorizingInput": 1, "covenantId": "4d10952ecec7…a6d915" }
    },
    { "value": "195728041000", "scriptPublicKey": "000020580588…b88aac", "covenant": null }
  ],
  "subnetworkId": "0000000000000000000000000000000000000000",
  "lockTime": "0",
  "gas": "0",
  "storageMass": "0",
  "payload": ""
}
```

Input 0 is the name's covenant output, input 1 its claim (another covenant output, which nobody signs), and input 2
a coin of the wallet's.

- KNS transactions are **version 1**, the version that carries covenant bindings.
- Every 64-bit number is a **decimal string**: amounts, `sequence`, `lockTime`, `gas`. Read them as `bigint`.
- A `scriptPublicKey` is its **u16 version in the first 4 hex characters, big-endian**, then the script: `0000` +
  `20 <x-only key> ac` is a Schnorr key's, `0000` + `aa20 <hash> 87` is a P2SH's.
- An input's `index` is the index of the output it spends in transaction `transactionId`, and its `utxo` is that
  output, with `covenantId` when it carries one. An output's `covenant` binds it to a covenant id and names the
  input that authorizes it, by position.
- `id` is not the id of the transaction that gets sent: in every test, the transaction the module sent had another
  id, and the document's id was never on chain. Keep the field as it is (some wallets refuse a document without
  one), and take the transaction id from the call's answer: `done.txid`, `result.txid`.

`signInputs` lists the inputs to sign:

```json
[
  { "index": 0, "sighashType": 1, "scheme": "schnorr", "sighash": "4c0411496b9e…177a0a" },
  { "index": 2, "sighashType": 1, "scheme": "schnorr", "sighash": "30ffeb739073…048892" }
]
```

`index` is the **position in `inputs`**, counted from 0, not an outpoint's `index`: here position 0 spends output 3
and position 2 spends output 5. `sighashType` is always 1 (SIGHASH_ALL). `scheme` is the account's. `sighash` is the
32-byte hash that input needs signed, in hex: for an ECDSA account it is already the ECDSA hash.

## Which inputs, and why signing them is safe

| Transaction                                               | The inputs you are asked to sign                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| a registration, a buy                                     | your account's coins only                                                                           |
| a transfer, a profile change, the primary flag, a listing | the name's covenant output (a P2SH whose UTXO carries the deployment's `covenantId`) and your coins |
| a cancel                                                  | the listing's covenant output and your coins                                                        |
| a subdomain mint                                          | the parent name's covenant output and your coins                                                    |
| `probeSigner()`                                           | a live registry output that is not yours, on purpose, and one of your coins; nothing is broadcast   |

Other covenant inputs of the same transactions, such as the gap a registration splits, are unlocked by their
contracts and never handed to the wallet.

A buy of a listing with a marketplace partner fee asks for the same inputs as any buy. It pays one more plain
output: the seller at output 1, the claim at 2, the partner at 3, and change after it. A wallet that shows a
transaction's outputs shows both payments; the plan's `sale` says what each is
([wallet integration guide, section 6.7](wallet-integration.md#67-marketplace)).

A covenant output is not at your address, so a wallet that signs only its own address's inputs cannot spend a name.
Signing it is what tells the name's contract that its holder agreed. The signature hash commits to every input's
outpoint, to the script public key and amount of the output being spent, and to every output, covenant bindings
included. A signature is therefore good for this one transaction and nothing else; it says nothing about the redeem
script behind the P2SH, which the wallet never needs to see.

## What `sign` hands back

The same document, with `signatureScript` of each requested input set to `41 ‖ signature ‖ 01`: 132 hex characters,
the push of 65 bytes, the 64-byte signature and the sighash type. Change nothing else. Only those 64 bytes are read
back; the module builds the real witness of each input itself.

- Schnorr: BIP-340 over `sighash`, 64 bytes.
- ECDSA: 64-byte compact (r ‖ s, not DER), **low S**, over `sighash` as given, with no further hashing. A high-S
  signature is refused.
- Do not broadcast, and do not re-serialize the transaction through a library that predates covenants: it would drop
  the covenant bindings, and the hash would no longer be the one signed.

The module then checks every signature against its own hash under the account's key and runs every input through
the script interpreter before it sends. A refused signature is `KnsTxError` code `signature-invalid`, and nothing
was sent.

## The signature hash

This is rusty-kaspa's `calc_schnorr_signature_hash` and `calc_ecdsa_signature_hash`
(`consensus/core/src/hashing/sighash.rs`), written out for SIGHASH_ALL, the only type KNS asks for.

**H** is BLAKE2b with a 32-byte output, keyed (the BLAKE2 key parameter, not a prefix) with the ASCII bytes
`TransactionSigningHash`. Integers are little-endian. "len" is a u64. Txids, covenant ids and hashes are the bytes
their hex spells, in order.

The preimage for input _i_, in order:

| Field                 | Bytes                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| version               | u16                                                                                                                                                                        |
| previous outputs hash | H(for every input: txid ‖ u32 index)                                                                                                                                       |
| sequences hash        | H(for every input: u64 sequence)                                                                                                                                           |
| sig-op counts hash    | H(for every input: u8 sigOpCount); **version 0 only**                                                                                                                      |
| outpoint of _i_       | txid ‖ u32 index                                                                                                                                                           |
| spent script          | the spent output's script public key: u16 version ‖ len ‖ script                                                                                                           |
| amount, sequence      | u64 amount of the spent output ‖ u64 sequence of _i_                                                                                                                       |
| sig-op count          | u8 sigOpCount of _i_; **version 0 only**                                                                                                                                   |
| outputs hash          | H(for every output: u64 value ‖ u16 script version ‖ len ‖ script, and **from version 1**: u8 1 ‖ u16 authorizingInput ‖ covenantId when it has a covenant, u8 0 when not) |
| lock time             | u64                                                                                                                                                                        |
| subnetwork id         | 20 bytes                                                                                                                                                                   |
| gas                   | u64                                                                                                                                                                        |
| payload hash          | 32 zero bytes when the subnetwork is native and the payload empty, else H(len ‖ payload)                                                                                   |
| sighash type          | u8, 1                                                                                                                                                                      |

- **Schnorr** signs H(preimage).
- **ECDSA** signs SHA-256(SHA-256(`TransactionSigningHashECDSA`) ‖ H(preimage)): plain SHA-256, prefixed with the
  SHA-256 of that ASCII string.

`computeBudget`, `storageMass`, `blockDaaScore`, `isCoinbase` and the inputs' `covenantId` are not in the hash.

A signer that recomputes:

```ts
import { toHex } from '@knsdomains/sdk'
import type { SignInput } from '@knsdomains/sdk-tx'

declare function signatureHash(tx: unknown, index: number, scheme: 'schnorr' | 'ecdsa'): Uint8Array // examples/wallet/sighash.mjs

function checkedHash(doc: unknown, input: SignInput): Uint8Array {
  const mine = signatureHash(doc, input.index, input.scheme)
  if (toHex(mine) !== input.sighash) throw new Error(`input ${input.index} is not the transaction it claims to be`)
  return mine
}
```

Sign `checkedHash(doc, input)`, never `input.sighash` taken on trust.
