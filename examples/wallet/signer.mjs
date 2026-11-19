// A KnsSigner backed by a key the wallet holds. This is the piece a wallet writes itself: `@knsdomains/sdk-tx` builds
// and checks the transaction, asks this object to sign the inputs it names, and verifies every signature that
// comes back against its own hash before anything is sent. In a real wallet the key stays in the keyring and
// `sign` asks it; here it is a hex string, for a script on testnet. It signs only a hash it computed itself from
// the transaction (./sighash.mjs) and refuses one that differs from what it was asked to sign.

import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js'
import { OwnerScheme, fromHex, ownerAddress, ownerFromEcdsaKey, toHex } from '@knsdomains/sdk'
import { assertSignableDocument } from '@knsdomains/sdk-tx'
import { signatureHash } from './sighash.mjs'

/**
 * @param {{ privateKey: string, scheme: 'schnorr' | 'ecdsa', network: string, prefix: 'kaspa' | 'kaspatest' }} options
 * @returns {import('@knsdomains/sdk-tx').KnsSigner}
 */
export function keySigner({ privateKey, scheme, network, prefix }) {
  const key = fromHex(privateKey, 'private key')
  const compressed = secp256k1.getPublicKey(key, true)
  const owner =
    scheme === 'schnorr'
      ? { scheme: OwnerScheme.Schnorr, bytes: schnorr.getPublicKey(key) }
      : ownerFromEcdsaKey(compressed)
  const address = ownerAddress(owner, prefix)
  if (!address) throw new Error('this key has no address')
  return {
    id: 'example-wallet',
    name: 'Example wallet',
    network,
    address,
    owner,
    ownerScheme: scheme,
    // 64 hex (x-only) for Schnorr, 66 hex (compressed) for ECDSA.
    ownerPubkey: scheme === 'schnorr' ? toHex(owner.bytes) : toHex(compressed),
    sign(safeJson, signInputs) {
      // Checks the document has an id, and that every named input exists, carries its UTXO and is unsigned.
      const doc = /** @type {{ inputs: { signatureScript?: string }[] }} */ (
        assertSignableDocument(
          safeJson,
          signInputs.map((s) => s.index),
          'Example wallet'
        )
      )
      for (const input of signInputs) {
        if (input.sighashType !== 1) throw new Error(`refusing sighash type ${input.sighashType}`)
        if (input.scheme !== scheme) throw new Error(`asked for a ${input.scheme} signature from a ${scheme} account`)
        const hash = signatureHash(doc, input.index, scheme)
        if (toHex(hash) !== input.sighash)
          throw new Error(`input ${input.index} is not the transaction it claims to be`)
        const signature =
          scheme === 'schnorr'
            ? schnorr.sign(hash, key)
            : secp256k1.sign(hash, key, { prehash: false, lowS: true, format: 'compact' })
        // 0x41 pushes 65 bytes: the 64-byte signature and the sighash type.
        doc.inputs[input.index].signatureScript = `41${toHex(signature)}01`
      }
      return Promise.resolve(JSON.stringify(doc))
    },
  }
}
