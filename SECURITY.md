# Security

ATC JSON Viewer formats JSON in the browser tab you click. This page says what it does and doesn't do, why it needs each permission, how you can check every claim yourself, and how to report a problem.

## What it does

- **Nothing until you click.** The extension has no content scripts: it isn't loaded into the pages you visit. It only acts when you click its toolbar icon or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>.
- **Only the tab you click.** On a click, the service worker injects the viewer (`viewer.js`) into that one tab. The viewer reads the page's text, and if it is JSON, shows it formatted. A second click puts the original page back.
- **Your settings, on this device.** Your choices (theme, view, font size and so on) are saved with `chrome.storage.local` in this browser profile.

## What it never does

- **No network access.** It makes no requests and sends nothing anywhere: no analytics, no error reports, no update checks of its own.
- **No access to other tabs, history, cookies or downloads**, and no access to any site you haven't clicked it on.
- **No page content is stored.** The formatted page lives in memory and is gone when you restore the page or leave it.
- **No code from the page is run, and no text from the page becomes HTML.** Values are always inserted as text, so a JSON value can't add HTML or scripts to the viewer. Only `http:` and `https:` addresses become links, and the JSONPath query is read by a hand-written parser, not run as code.
- **JSON Web Tokens are only decoded, in your browser.** Their signature is not verified, and the viewer says so.

## Permissions

| Permission | Why it's needed | Install warning |
|------------|-----------------|-----------------|
| `activeTab` | Access to the current tab, only after you click, and only until you leave the page | None |
| `scripting` | Lets the service worker inject the viewer into that tab | None |
| `storage` | Saves your settings in this browser | None |

Not requested: host permissions (access to websites), `tabs`, `history`, `cookies`, `webRequest`, content scripts, `externally_connectable` (websites talking to the extension) and `web_accessible_resources` (websites loading the extension's files).

## Content Security Policy

Production builds set this policy for the extension's own pages, which are the service worker and the settings page:

```text
script-src 'self'; object-src 'self'; connect-src 'none'
```

They may only run the extension's own scripts and can't connect anywhere.

This policy does **not** cover the viewer inside a web page: `viewer.js` runs in the tab you clicked, where the browser applies the page's rules, not the extension's. For the viewer, the guarantee is that its code contains no way to reach the network (see the next section) and that every line of it is public in this repository.

## How to verify

1. **Read the source.** Everything the extension ships is built from this repository. It has no runtime dependencies: the npm packages in `package.json` are build and test tools only, and none of their code ends up in the extension except a few lines from WXT that start each script and give it access to the browser's extension APIs.
2. **Build it and run the checks:**

   ```powershell
   npm ci
   npm run build
   npm run check:security
   ```

   `check:security` fails if the built extension:

   - contains `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`, `eval(` or `new Function(`;
   - turns text into HTML (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`);
   - asks for any permission other than the three above, or has any of the manifest entries listed as not requested;
   - lacks the policy for its own pages;
   - contains a file Chrome would refuse to load.

3. **Look at the installed extension.** In `chrome://extensions` (or `edge://extensions`), **Details** lists its permissions. **Inspect views: service worker** opens DevTools, where the **Network** tab stays empty while you use it.

## Reporting a vulnerability

Please report security problems privately through [GitHub's private vulnerability reporting](https://github.com/atc-net-apps/atc-soft-json-viewer/security/advisories/new), not in a public issue. You'll get an answer there, and the fix is published once it's ready.

Only the latest version is supported with fixes.
