import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// See https://wxt.dev/guide/essentials/unit-testing.html
export default defineConfig({
  // WxtVitest gives tests the same setup as the extension: an in-memory `browser` API, auto-imports and aliases.
  plugins: [WxtVitest()],
  test: {
    // happy-dom is a lightweight, in-memory web page, so code that touches `document` can be tested without a browser.
    environment: 'happy-dom',
  },
});
