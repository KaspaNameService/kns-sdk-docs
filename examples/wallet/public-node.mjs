// A node from the Kaspa public node network. Its resolvers answer the least-loaded public node that serves a
// network, with TLS, over Borsh wRPC; the same host serves JSON wRPC at `/wrpc/json`.

/* global AbortSignal */

const RESOLVERS = ['eric.kaspa.stream', 'maxim.kaspa.stream', 'john.kaspa.red', 'mike.kaspa.red']

/** @returns {Promise<{ borsh: string, json: string }>} */
export async function publicNode(network = 'testnet-10') {
  for (const resolver of RESOLVERS) {
    try {
      const res = await fetch(`https://${resolver}/v2/kaspa/${network}/tls/wrpc/borsh`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const { url } = /** @type {{ url?: unknown }} */ (await res.json())
      if (typeof url === 'string' && url.startsWith('wss://') && url.endsWith('/wrpc/borsh')) {
        return { borsh: url, json: url.replace(/\/wrpc\/borsh$/, '/wrpc/json') }
      }
    } catch {
      // try the next resolver
    }
  }
  throw new Error(`no public ${network} node answered`)
}
