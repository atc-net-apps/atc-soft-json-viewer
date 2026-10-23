import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  // auto-icons generates the 16, 32, 48 and 128 px icons from assets/icon.png (grey in dev builds).
  modules: ['@wxt-dev/auto-icons'],
  manifest: {
    name: 'ATC JSON Viewer',
    description:
      'Formats JSON in the current tab with one click. Open source, no tracking, no network access.',
    homepage_url: 'https://github.com/atc-net-apps/atc-soft-json-viewer',
    // activeTab: access to the current tab only after the user clicks the toolbar button or presses the shortcut.
    // scripting: lets the background inject the viewer into that tab.
    permissions: ['activeTab', 'scripting'],
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
  },
});
