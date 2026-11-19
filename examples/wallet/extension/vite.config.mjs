// One build for the popup page and the service worker; public/manifest.json is copied as it is.
export default {
  build: {
    rollupOptions: {
      input: { popup: 'popup.html', background: 'src/background.mjs' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
}
