// The popup: a recipient field (level 1, no module) and the module loaded on demand (level 3).

/* global document */

import { Kns } from '@knsdomains/sdk'
import { load } from '@knsdomains/wasm'
import { KnsTx } from '@knsdomains/sdk-tx'

const kns = new Kns({ network: 'testnet-10' })
const $ = (id) => document.getElementById(id)
const say = (x) => {
  $('out').textContent =
    typeof x === 'string' ? x : JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}` : v), 2)
}

$('resolve').addEventListener('click', () => {
  kns.recipientFor($('name').value).then(
    (r) => say(r.kind === 'neither' ? r.reason : { name: r.name, address: r.address, fault: r.fault }),
    (e) => say(String(e))
  )
})

$('module').addEventListener('click', () => {
  load()
    .then(async (wasm) => {
      const status = await new KnsTx({ kns, wasm }).status()
      say(`module ${wasm.api_version()}, deployment ${status.lineage?.anchor_id?.slice(0, 8) ?? '?'}`)
    })
    .catch((e) => say(String(e)))
})
