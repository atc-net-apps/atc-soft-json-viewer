import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  // auto-icons generates the 16, 32, 48 and 128 px icons from assets/icon.png (grey in dev builds).
  modules: ['@wxt-dev/auto-icons'],
  manifest: ({ command }) => ({
    name: 'ATC JSON Viewer',
    description:
      'Formats JSON in the current tab with one click. Open source, no tracking, no network access.',
    homepage_url: 'https://github.com/atc-net-apps/atc-soft-json-viewer',
    // activeTab: access to the current tab only after the user clicks the toolbar button or presses the shortcut.
    // scripting: lets the background inject the viewer into that tab.
    // storage: remembers the user's settings in this browser (no install warning).
    permissions: ['activeTab', 'scripting', 'storage'],
    action: {
      default_title: 'Format JSON (Alt+Shift+J)',
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Alt+Shift+J',
        },
      },
    },
    // The extension's own pages (the service worker and the settings page) may only run the
    // extension's own scripts and can't connect anywhere. Not for `npm run dev`, whose live reload
    // needs a connection to the dev server. This doesn't cover the viewer inside a web page; see SECURITY.md.
    ...(command === 'build' && {
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'; connect-src 'none'",
      },
    }),
  }),
  vite: () => ({
    build: {
      // Vite adds a small fetch()-based loader to HTML pages for browsers without module preloading.
      // Chrome and Edge have it built in, and the shipped code must not contain fetch at all.
      modulePreload: { polyfill: false },
    },
  }),
});
