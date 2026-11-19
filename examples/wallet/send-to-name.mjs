// What a wallet's send screen does with whatever the user typed into the recipient field, and what its
// account and history screens show for an address. Reads only: nothing here needs a key or the wasm module.
//
//   node examples/wallet/send-to-name.mjs <name or address> [--prove]
//
// --prove checks every answer against a public node as well as the tracker.

import { Kns, KnsError, RefutedError, WrpcJson, fromWrpc } from '@knsdomains/sdk'
import { publicNode } from './public-node.mjs'

const network = 'testnet-10'
const input = process.argv[2] ?? ''
const prove = process.argv.includes('--prove')

let rpc = null
if (prove) rpc = await WrpcJson.connect((await publicNode(network)).json)
const kns = new Kns({ network, ...(rpc ? { node: fromWrpc(rpc, { network }) } : {}) })

/** What the send screen shows, and whether it may go on to the amount. */
async function recipientField(text) {
  let r
  try {
    r = await kns.recipientFor(text) // never throws on the input itself
  } catch (e) {
    if (e instanceof RefutedError) return { ok: false, say: 'The name service gave an answer the chain refutes.' }
    if (e instanceof KnsError) return { ok: false, say: `The name service is unavailable: ${e.message}` }
    throw e
  }
  const warn = []
  // `reason` is English text for a developer, with Markdown in it: log it, and show the user your own words.
  if (r.kind === 'neither') return { ok: false, say: 'Not a .kas name or a Kaspa address.', log: r.reason }
  if (r.ownerType === 'p2sh') warn.push('This address is a multisig or other script.')
  if (r.kind === 'address') return { ok: true, payTo: r.address, show: r.address, warn }
  if (!r.address) {
    const why = {
      unresolved: 'No one holds this name, or the name service cannot describe it yet.',
      'in-covenant': 'A contract holds this name, and a contract has no address to pay.',
      withheld: 'This name breaks the naming rules and is never resolved.',
      moved: 'This name moved to a newer contract version.',
      'not-ready': 'The name service is catching up. Try again in a moment.',
    }
    return { ok: false, say: why[r.fault ?? 'unresolved'] ?? `Cannot pay this name (${r.fault})` }
  }
  if (r.resolved?.shown.nonAscii) warn.push('This name contains non-ASCII characters; check it is the one you mean.')
  if (r.listed) warn.push('This name is for sale. The seller receives this payment until someone buys it.')
  warn.push('Names can change hands. Check the address before you send.')
  return { ok: true, payTo: r.address, show: `${r.name} → ${r.address}`, proven: r.proven, warn }
}

const field = await recipientField(input)
console.log('recipient field:', field)

if (field.ok) {
  // The account or history screen: the name the holder chose to show for this address, or the address itself.
  const primary = await kns.primaryNameFor(field.payTo)
  console.log('shown for', field.payTo, '→', primary.name ?? '(no primary name: show the address)')
  const page = await kns.namesOf(field.payTo, { limit: 5 })
  console.log(
    'names this address holds:',
    page.domains.map((d) => kns.display(d).text),
    page.next_cursor ? '(more pages)' : ''
  )
}
rpc?.close()
