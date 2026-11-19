// A marketplace on KNS listings, with a partner fee written into each listing it makes: browse the names for sale,
// list one with or without the fee, cancel, and buy, printing what the seller, the buyer and the partner each see.
// Every write prints what the wallet would be asked to sign and signs and sends only with --yes. Testnet only.
//
// Testnet-10 lineage 4d10952e, the one the packages carry, runs the partner fee. `browse` reads its tracker; the
// writes are the calls the packages' live test sold a name with, a 10% fee paid to the partner at output 3.
//
//   node examples/wallet/marketplace.mjs browse [<partner address> | none] [--sort price_asc]
//   KNS_KEY=<64 hex> [KNS_SCHEME=ecdsa] node examples/wallet/marketplace.mjs <command> [arguments] [--yes]
//
//   list <name> <kas> [<partner address> <bps>]   offer a name for sale, with a partner fee in basis points
//   cancel <name>                                 withdraw the offer
//   buy <name> <kas>                              buy a listed name at the price you were shown

import { Kns, formatBps, formatKas, parseKas } from '@knsdomains/sdk'
import { loadNode } from '@knsdomains/wasm/node'
import { KnsTx, KnsTxError, partnerFeeWaivedText } from '@knsdomains/sdk-tx'
import { keySigner } from './signer.mjs'
import { publicNode } from './public-node.mjs'

const network = 'testnet-10'
const flags = new Set(['--yes', '--sort'])
const argv = process.argv.slice(2)
const sortAt = argv.indexOf('--sort')
const sort = sortAt >= 0 ? argv[sortAt + 1] : 'price_asc'
const [command = 'browse', ...rest] = argv.filter((a, i) => !flags.has(a) && (sortAt < 0 || i !== sortAt + 1))
const yes = argv.includes('--yes')
const kns = new Kns({ network })

/** One line per listing: the name, the price, the partner fee and who gets it, and when it was listed. */
function showListing(record) {
  const price = record.listed_price_sompi ?? 0n
  const fee = record.listed_fee_bps
    ? `partner fee ${formatKas(record.listed_fee_sompi ?? 0n)} KAS (${formatBps(record.listed_fee_bps)}) to ${record.listed_fee_to_address}`
    : 'no partner fee'
  const at =
    record.listed_at === undefined
      ? 'listed at an unknown time'
      : `listed ${new Date(Number(record.listed_at)).toISOString()}`
  console.log(`${kns.display(record).text}: ${formatKas(price)} KAS, ${fee}, ${at}`)
}

/** The write client, for the commands that sign. */
async function writer() {
  const key = process.env.KNS_KEY
  if (!key) throw new Error('set KNS_KEY to a testnet private key (64 hex)')
  const node = await publicNode(network)
  const signer = keySigner({
    privateKey: key,
    scheme: process.env.KNS_SCHEME === 'ecdsa' ? 'ecdsa' : 'schnorr',
    network,
    prefix: 'kaspatest',
  })
  const tx = new KnsTx({ kns, wasm: await loadNode(), nodeUrl: node.borsh, signer })
  await tx.status()
  console.log(`account ${signer.address}, node ${new URL(node.borsh).host}`)
  return tx
}

/** What a sale's plan says each payee gets, then sign and send only with --yes. */
async function confirmAndSubmit(tx, plan, who) {
  console.log(`the ${who}'s wallet will be asked to:`, plan.summary)
  if (plan.sale) {
    const { sale } = plan
    console.log(`  price ${formatKas(sale.priceSompi)} KAS: the seller gets ${formatKas(sale.sellerSompi)} KAS`)
    if (sale.partnerFee)
      console.log(
        `  the partner ${sale.partnerFee.address} gets ${formatKas(sale.partnerSompi)} KAS (${formatBps(sale.partnerFee.bps)}) at output 3`
      )
  }
  if (plan.partnerFeeWaived) console.log(`  ${partnerFeeWaivedText(plan.partnerFeeWaived)}`)
  if (plan.spendsSompi > 0n) console.log(`  it pays ${formatKas(plan.spendsSompi)} KAS beyond the network fee`)
  if (!yes) return console.log('(add --yes to sign and send)')
  const done = await tx.submit(plan)
  console.log('sent', done.txid)
  await tx.waitForIndex(plan.name, done.txid)
  console.log('the tracker shows it')
}

try {
  switch (command) {
    case 'browse': {
      const partner = rest[0]
      const page = await kns.listings({ ...(partner ? { partner } : {}), sort, limit: 20 })
      console.log(
        `${page.matched} listing${page.matched === 1 ? '' : 's'}${partner ? ` for partner ${partner}` : ''}, by ${sort}:`
      )
      for (const record of page.domains) showListing(record)
      if (page.next_cursor) console.log(`more: pass cursor ${page.next_cursor}`)
      break
    }
    case 'list': {
      const tx = await writer()
      const [name = '', kas = '0', address, bps] = rest
      const partnerFee = address ? { address, bps: Number(bps) } : undefined
      await confirmAndSubmit(tx, await tx.planList(name, parseKas(kas), { partnerFee }), 'seller')
      break
    }
    case 'cancel': {
      const tx = await writer()
      await confirmAndSubmit(tx, await tx.planCancel(rest[0] ?? ''), 'seller')
      break
    }
    case 'buy': {
      const tx = await writer()
      await confirmAndSubmit(
        tx,
        await tx.planBuy(rest[0] ?? '', { expectedPriceSompi: parseKas(rest[1] ?? '0') }),
        'buyer'
      )
      break
    }
    default:
      throw new Error(`unknown command ${command}`)
  }
} catch (e) {
  if (!(e instanceof Error) || e.name === 'Error') throw e
  console.log(`refused (${e.name}${e instanceof KnsTxError ? ` ${e.code}` : ''}): ${e.message}`)
  if (e instanceof KnsTxError && e.afterSigning)
    console.log('the wallet had signed: look the name up before trying again', e.sentTxid ?? '')
  process.exitCode = 1
}
