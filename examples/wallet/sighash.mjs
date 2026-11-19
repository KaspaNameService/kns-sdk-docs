// Kaspa's signature hash, recomputed from the Safe JSON `@knsdomains/sdk-tx` hands a signer: for a wallet that signs only
// what it hashed itself. It follows rusty-kaspa's `calc_schnorr_signature_hash` and `calc_ecdsa_signature_hash`
// (consensus/core/src/hashing/sighash.rs), SIGHASH_ALL only, transaction versions 0 and 1. A signer compares the
// result with each `signInputs[i].sighash` and refuses on any difference.

/* global TextEncoder */

import { blake2b } from '@noble/hashes/blake2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { fromHex } from '@knsdomains/sdk'

const ZERO_HASH = new Uint8Array(32)
const SIGNING_KEY = new TextEncoder().encode('TransactionSigningHash')
const ECDSA_DOMAIN = sha256(new TextEncoder().encode('TransactionSigningHashECDSA'))

/** Little-endian writes into a byte list. */
class Writer {
  constructor() {
    this.parts = []
  }
  bytes(b) {
    this.parts.push(b)
    return this
  }
  int(n, size) {
    const out = new Uint8Array(size)
    let v = BigInt(n)
    for (let i = 0; i < size; i++) {
      out[i] = Number(v & 0xffn)
      v >>= 8n
    }
    return this.bytes(out)
  }
  u8(n) {
    return this.int(n, 1)
  }
  u16(n) {
    return this.int(n, 2)
  }
  u32(n) {
    return this.int(n, 4)
  }
  u64(n) {
    return this.int(n, 8)
  }
  varBytes(b) {
    return this.u64(b.length).bytes(b)
  }
  /** BLAKE2b-256 keyed with "TransactionSigningHash", the hasher of the preimage and of each part of it. */
  digest() {
    const all = new Uint8Array(this.parts.reduce((n, p) => n + p.length, 0))
    let at = 0
    for (const p of this.parts) {
      all.set(p, at)
      at += p.length
    }
    return blake2b(all, { key: SIGNING_KEY, dkLen: 32 })
  }
}

/** A script public key in Safe JSON: its u16 version in the first 4 hex characters, then the script. */
function scriptPublicKey(w, hex) {
  return w.u16(parseInt(hex.slice(0, 4), 16)).varBytes(fromHex(hex.slice(4), 'script'))
}

function outputsHash(tx) {
  const w = new Writer()
  for (const o of tx.outputs) {
    w.u64(o.value)
    scriptPublicKey(w, o.scriptPublicKey)
    if (tx.version >= 1) {
      w.u8(o.covenant ? 1 : 0)
      if (o.covenant) w.u16(o.covenant.authorizingInput).bytes(fromHex(o.covenant.covenantId, 'covenant id'))
    }
  }
  return w.digest()
}

/**
 * The hash input `index` of `tx` (parsed Safe JSON) needs signed with SIGHASH_ALL, under `scheme`.
 * @returns {Uint8Array}
 */
export function signatureHash(tx, index, scheme) {
  const input = tx.inputs[index]
  if (!input?.utxo) throw new Error(`input ${index} carries no utxo entry`)
  const prev = new Writer()
  for (const i of tx.inputs) prev.bytes(fromHex(i.transactionId, 'txid')).u32(i.index)
  const seq = new Writer()
  for (const i of tx.inputs) seq.u64(i.sequence)
  const w = new Writer().u16(tx.version).bytes(prev.digest()).bytes(seq.digest())
  if (tx.version < 1) {
    const ops = new Writer()
    for (const i of tx.inputs) ops.u8(i.sigOpCount ?? 0)
    w.bytes(ops.digest())
  }
  w.bytes(fromHex(input.transactionId, 'txid')).u32(input.index)
  scriptPublicKey(w, input.utxo.scriptPublicKey)
  w.u64(input.utxo.amount).u64(input.sequence)
  if (tx.version < 1) w.u8(input.sigOpCount ?? 0)
  const subnetwork = fromHex(tx.subnetworkId, 'subnetwork id')
  const payload = fromHex(tx.payload ?? '', 'payload')
  const native = subnetwork.every((b) => b === 0)
  w.bytes(outputsHash(tx))
    .u64(tx.lockTime)
    .bytes(subnetwork)
    .u64(tx.gas)
    .bytes(native && payload.length === 0 ? ZERO_HASH : new Writer().varBytes(payload).digest())
    .u8(1)
  const schnorrHash = w.digest()
  if (scheme === 'schnorr') return schnorrHash
  const ecdsa = new Uint8Array(64)
  ecdsa.set(ECDSA_DOMAIN)
  ecdsa.set(schnorrHash, 32)
  return sha256(ecdsa)
}
