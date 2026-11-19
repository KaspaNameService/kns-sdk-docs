// Every write a wallet offers, through the wallet's own signer (./signer.mjs) and a public node. Each command
// prints what the wallet would show and asks nothing of the chain until you add --yes. Testnet only: it spends
// the key's testnet KAS.
//
//   KNS_KEY=<64 hex> [KNS_SCHEME=ecdsa] node examples/wallet/manage-names.mjs <command> [arguments] [--yes]
//
//   probe                          will this signer sign covenant inputs? broadcasts nothing
//   register <name>                register a root name
//   primary <name>                 make it the name shown for this address
//   unprimary <name>               stop showing it
//   transfer <name> <address>      hand it to another holder
//   profile <name> <display name>  write a profile with a display name, pin it, point the name at it
//   list <name> <kas>              offer it for sale
//   cancel <name>                  withdraw the offer
//   buy <name> <kas>               buy a listed name at the price you were shown
//   subdomain <parent> <label> <address>   mint label.parent for an address

/* global crypto, TextEncoder, TextDecoder */

import { Kns, formatKas, parseKas, toHex } from '@knsdomains/sdk'
import { loadNode } from '@knsdomains/wasm/node'
import { KnsTx, KnsTxError } from '@knsdomains/sdk-tx'
import { keySigner } from './signer.mjs'
import { publicNode } from './public-node.mjs'

const network = 'testnet-10'
const [command = 'probe', ...rest] = process.argv.slice(2).filter((a) => a !== '--yes')
const yes = process.argv.includes('--yes')
const key = process.env.KNS_KEY
if (!key) throw new Error('set KNS_KEY to a testnet private key (64 hex)')

const node = await publicNode(network)
const kns = new Kns({ network })
const signer = keySigner({
  privateKey: key,
  scheme: process.env.KNS_SCHEME === 'ecdsa' ? 'ecdsa' : 'schnorr',
  network,
  prefix: 'kaspatest',
})
const tx = new KnsTx({ kns, wasm: await loadNode(), nodeUrl: node.borsh, signer })
console.log(`account ${signer.address}, node ${new URL(node.borsh).host}`)

/** Show what the wallet will be asked to sign, then sign and send only with --yes. */
async function confirmAndSubmit(plan) {
  console.log('the wallet will be asked to:', plan.summary)
  if (plan.recipient?.warn) console.log('WARNING: the recipient is a multisig or a contract. Ask the user to confirm.')
  if (plan.spendsSompi > 0n) console.log(`it pays ${formatKas(plan.spendsSompi)} KAS beyond the network fee`)
  if (!yes) return console.log('(add --yes to sign and send)')
  const done = await tx.submit(plan)
  console.log('sent', done.txid)
  if (done.warnings?.length) console.log('show the new holder:', done.warnings)
  await tx.waitForIndex(plan.name, done.txid)
  console.log('the tracker shows it')
}

/** Drop every empty field at every level: '', null, undefined, and an object left with nothing in it. */
function pruned(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    const p = pruned(v)
    if (p === undefined || p === null || p === '') continue
    if (typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0) continue
    out[k] = p
  }
  return out
}

/** JSON with the keys of every object sorted and no whitespace. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** A profile as canonical JSON bytes. */
function canonicalProfileBytes(profile) {
  return new TextEncoder().encode(canonicalJson(pruned(profile)))
}

try {
  switch (command) {
    case 'probe': {
      const verdict = await tx.probeSigner()
      console.log(verdict.verdict)
      break
    }
    case 'register': {
      const name = kns.normalize(rest[0] ?? '')
      const q = kns.quote(name)
      console.log(`${name}: fee ${formatKas(q.feeSompi)} KAS, ${formatKas(q.lockedSompi)} KAS locked with the name,`)
      console.log(`the wallet must hold ${formatKas(q.totalToFund)} KAS; available: ${await kns.available(name)}`)
      if (!yes) break
      const done = await tx.registerName(name, { onProgress: (p) => console.log('  ', p.phase) })
      console.log('registered in', done.txid)
      await tx.waitForIndex(name, done.txid)
      console.log('the tracker shows it')
      break
    }
    case 'primary':
      await confirmAndSubmit(await tx.planSetPrimary(rest[0] ?? ''))
      break
    case 'unprimary':
      await confirmAndSubmit(await tx.planClearPrimary(rest[0] ?? ''))
      break
    case 'transfer':
      await confirmAndSubmit(await tx.planTransfer(rest[0] ?? '', rest[1] ?? ''))
      break
    case 'list':
      await confirmAndSubmit(await tx.planList(rest[0] ?? '', parseKas(rest[1] ?? '0')))
      break
    case 'cancel':
      await confirmAndSubmit(await tx.planCancel(rest[0] ?? ''))
      break
    case 'buy':
      await confirmAndSubmit(await tx.planBuy(rest[0] ?? '', { expectedPriceSompi: parseKas(rest[1] ?? '0') }))
      break
    case 'subdomain':
      await confirmAndSubmit(await tx.planMintSubdomain(rest[0] ?? '', rest[1] ?? '', rest[2] ?? ''))
      break
    case 'profile': {
      const domain = await tx.domainOf(rest[0] ?? '', { notListed: true })
      const profile = { v: 1, name: domain.name, owner: signer.ownerPubkey, display: rest.slice(1).join(' ') }
      const bytes = canonicalProfileBytes(profile)
      const digest = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      if (digest === domain.metadata) {
        console.log('nothing changed: the name already points at this profile')
        break
      }
      if (!yes) {
        console.log('would pin', new TextDecoder().decode(bytes), 'and point the name at', digest)
        console.log('(add --yes to pin, sign and send)')
        break
      }
      const res = await fetch(`${kns.api.base}/v1/pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: bytes,
      })
      if (!res.ok) throw new Error(`the tracker refused the pin: ${res.status} ${await res.text()}`)
      const pinned = await res.json()
      if (!pinned.cid.startsWith('bafkrei') || pinned.metadata !== digest)
        throw new Error('the pin answered another file')
      console.log('pinned', pinned.cid)
      await confirmAndSubmit(await tx.planUpdateProfile(domain.name, pinned.cid))
      const p = await kns.profileOf(domain.name)
      console.log('profile now:', p.kind, p.kind === 'verified' ? p.profile.display : '')
      break
    }
    default:
      throw new Error(`unknown command ${command}`)
  }
} catch (e) {
  if (!(e instanceof KnsTxError)) throw e
  console.log(`refused (${e.code}): ${e.message}`)
  if (e.afterSigning) console.log('the wallet had signed: look the name up before trying again', e.sentTxid ?? '')
  process.exitCode = 1
}
