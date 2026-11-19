// The service worker: the same module, imported statically (a service worker cannot use import()).

/* global chrome, self */

import { load } from '@knsdomains/wasm'

self.knsModuleVersion = async () => (await load()).api_version()

chrome.runtime.onInstalled.addListener(() => {
  self.knsModuleVersion().then((v) => console.log('KNS module', v))
})
