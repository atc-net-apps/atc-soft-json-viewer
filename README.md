# ATC JSON Viewer

A Chrome and Edge extension that turns raw JSON in the current tab into a readable, collapsible, colour-coded tree, with one click. Open source, no tracking, no network access.

**Viewing**

- 🌳 **Collapsible tree**: fold and unfold any object or array
- 🪜 **Unfold to level**: unfold 1, 2 or 3 levels, or everything, with one click
- ⏬ **Unfold everything inside**: open one object or array all the way down with ⇊ or Alt+click
- 📄 **Raw / Tree toggle**: switch to the exact text the server sent, and back
- 📋 **Copy value & path**: click any line to see its JSON path, and copy the path or the value
- 🔗 **Clickable links**: web addresses in values open in a new tab
- 🔢 **Item counts**: every object and array shows how many keys or items it has
- 🎨 **Light, dark or system theme**: syntax colours that follow your system, or a theme you choose
- 🔢 **Exact big numbers**: IDs beyond JavaScript's safe range are shown exactly as sent
- ⚠️ **Invalid JSON pointer**: broken JSON shows what is wrong, with the broken line highlighted and a caret at the exact column
- ⚡ **Large responses**: only what you unfold is drawn, and big arrays are shown 500 items at a time
- 📊 **Status bar**: shows the response's content type and size
- 💾 **Remembers your settings**: stored in this browser only

**Privacy & security**

- 🖱️ **Runs only when you click**: nothing happens on any page until you press the toolbar button
- 🔒 **No network access**: the extension never sends anything anywhere
- 🧱 **Minimal permissions**: `activeTab`, `scripting` and `storage`, with no install warning
- 📖 **Open source**: every line is in this repository

> **Status:** in development. Not yet available in the Chrome Web Store or Edge Add-ons; [install it from source](#install-from-source) in the meantime.

## 📋 Requirements

- Google Chrome or Microsoft Edge (current versions; Manifest V3)

## 🚀 Getting Started

### Install from source

1. Build the extension (see [Prerequisites](#prerequisites)):

   ```powershell
   npm ci
   npm run build
   ```

2. Open `chrome://extensions` (or `edge://extensions`) and switch on **Developer mode**.
3. Click **Load unpacked** and choose the `.output/chrome-mv3` folder.
4. Pin **ATC JSON Viewer** from the extensions menu (🧩) so its icon stays in the toolbar.

An extension loaded this way does not update itself. Rebuild and click **Reload** on its card after pulling changes.

### Use

1. Open a page that shows raw JSON, for example an API response.
2. Click the **ATC JSON Viewer** icon, or press **Alt+Shift+J**.
3. Click again (or press **Alt+Shift+J** again) to get the original page back.

If the page isn't JSON, nothing changes and the icon briefly shows **–**. Hover it to see why ("This page isn't JSON", or "ATC JSON Viewer can't run on this page" for browser pages such as `chrome://settings`).

To view a local `.json` file, drag it into the browser and click the icon. If nothing happens, open the extension's **Details** in `chrome://extensions` and switch on **Allow access to file URLs**.

You can change the shortcut at `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`).

## ✨ Features

### 🌳 Collapsible tree

Objects and arrays fold and unfold with the ▸ / ▾ arrow. The first two levels are unfolded when the page is formatted. The tree reads like JSON: keys in quotes, commas between entries, and escapes such as `\n` shown as written.

### 🪜 Unfold to level

The **Unfold 1 · 2 · 3 · All** buttons in the toolbar unfold every object and array down to that level and fold everything deeper, so they also fold the tree back up. **1** leaves only the top level open, and **All** unfolds everything. Big arrays still show 500 entries at a time, so **All** stays fast on large responses. The buttons are hidden in the raw view.

### ⏬ Unfold everything inside

Hover the first line of an object or array and a **⇊** button appears at its end. Click it to unfold that object or array and everything inside it, all the way down, without opening the rest of the response. The button then turns into **⇈**, which folds it all again. **Alt+click** on the ▸ / ▾ arrow does the same. As soon as you fold something inside by hand, the button goes back to ⇊. Big arrays still show 500 entries at a time.

### 📄 Raw / Tree toggle

The **Tree | Raw** switch in the toolbar shows the response exactly as the server sent it: nothing reformatted, reordered or rounded. It works for broken JSON too. The viewer remembers your choice, so if you prefer Raw, the next page opens in Raw. To get the browser's own page back instead, click the toolbar icon again.

### 📋 Copy value & path

Click any line in the tree to select it. The status bar at the bottom shows its JSON path, for example `$.items[0].sku`, with two buttons:

- **Copy path** copies the path, ready for JSONPath tools.
- **Copy value** copies the value: text without quotes, numbers exactly as sent, and objects or arrays as indented JSON. Big numbers keep every digit, even inside objects.

Copying works on HTTPS pages, on `localhost` and on plain-HTTP pages.

### 🔗 Clickable links

Values that are a web address (`http://` or `https://`) are underlined and open in a new tab when clicked. Only whole values that are web addresses become links. Other kinds of address, such as `javascript:` or `file:`, never do, so clicking a value can't run code or open files on your computer. The new tab isn't told which page the link came from.

### 🔢 Item counts

The first line of every object and array ends with a small count, such as **3 items** or **5 keys**, whether it is folded or unfolded. You can see how big a part of the response is without unfolding it.

### 🎨 Light and dark

By default, colours follow your operating system's light or dark setting and switch instantly when it changes. The **Theme** button in the toolbar cycles through **System → Light → Dark**, and the viewer remembers your choice for every page.

### 🔢 Exact big numbers

JavaScript can only represent integers up to 9 007 199 254 740 991 exactly. Larger numbers, such as 64-bit IDs, are normally rounded without warning: `9007199254740993` would turn into `…992`. ATC JSON Viewer keeps the digits exactly as the server sent them.

### ⚠️ Invalid JSON pointer

If the page claims to be JSON but isn't valid, the viewer explains the problem in plain English and gives the line and column, for example *"Line 5, column 38: Trailing comma: remove the last ","."*

Below the message, the text around the error is shown with line numbers: the broken line is highlighted, the character where the problem starts is outlined, and a **^** points at it. You see the 10 lines before and after the error. Very long lines, as in minified JSON, are cut to the part around the error. The whole text is always one click away in the **Raw** view.

### 📊 Status bar and settings

A toolbar runs along the top of the viewer and a status bar along the bottom, showing the content type the server sent (for example `application/json`) and the size of the response.

Your viewer settings, such as how many levels are unfolded when a page is formatted (2 by default), are remembered in this browser with `chrome.storage.local`. They never leave your computer, and no page content is ever stored.

### ⚡ Large responses

Only the parts you unfold are built, and big arrays and objects show their first 500 entries with a **Show more** link. A 1 MB response with 5 000 items formats in a few milliseconds.

## 🛠️ How We Develop

The extension is written in TypeScript with [WXT](https://wxt.dev/), a framework for browser extensions. It has no runtime dependencies: everything in the built extension is our own code. The npm packages are build and test tools only.

### Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer (the project's reference version is in `.nvmrc`)
- Git
- Chrome and Edge

### Run it in development mode

```powershell
npm ci           # install the exact tool versions from package-lock.json
npm run dev      # opens a separate Chrome window with the extension loaded
```

The dev browser uses its own fresh profile. Every time you save a file, the extension is rebuilt and reloaded. The icon is grey in development builds, so you can tell it apart from an installed copy.

To develop in Edge, create a `web-ext.config.ts` in the project root (it is git-ignored, because the path differs per machine) and run `npm run dev:edge`:

```ts
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  binaries: {
    edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  },
});
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development build in a fresh Chrome window, rebuilt on every save |
| `npm run dev:edge` | The same in Edge (needs `web-ext.config.ts`, see above) |
| `npm run build` | Release build in `.output/chrome-mv3/` (the same build is used for Chrome and Edge) |
| `npm run zip` | Packs the release build into a `.zip` for the stores |
| `npm run compile` | TypeScript type check |
| `npm test` | Unit tests (Vitest) |
| `npm run fixtures` | Local test server with sample responses (see [Sample responses](#sample-responses)) |

## 🧪 Local Testing

### Unit tests

```powershell
npm test
```

The tests run in an in-memory browser page ([happy-dom](https://github.com/capricorn86/happy-dom)) and finish in about a second.

### Sample responses

```powershell
npm run fixtures
```

This starts a small local server at <http://localhost:5179/> that serves the files in `test/fixtures/` with realistic content types. It only accepts connections from your own computer.

| File | Sent as | What to check |
|---|---|---|
| `orders.json` | `application/json` | Nesting, odd keys, `ledgerId` ends in …993, HTML in a string shows as text |
| `orders.strict-csp.json` | `application/json` with a strict Content-Security-Policy | Looks exactly like `orders.json` |
| `error.problem.json` | `application/problem+json` | An API error response is formatted |
| `broken.json` | `application/json` | Shows "Line 5, column 38: Trailing comma …" |
| `json-as-text.txt` | `text/plain` | Formatted, because the text is valid JSON |
| `not-json.txt` | `text/plain` | Nothing changes and the icon shows **–** |

With `npm run fixtures` and `npm run dev` running in two terminals, open each file and click the toolbar button.

## 🏗️ Architecture

- **Click to format**: the extension only acts on the tab you click, using Chrome's `activeTab` permission. It has no content scripts and no access to websites by default.
- **Injected viewer**: on click, the service worker injects `viewer.js` into the tab with `chrome.scripting`. A second click restores the page exactly.
- **Raw page detection**: Chrome and Edge show raw responses as a single `<pre>` (plus their own Pretty-print container for JSON). The viewer only formats pages that look exactly like that, so it never interferes with normal websites or other extensions.
- **Shadow DOM**: the viewer lives in a closed shadow root, so the page's styles can't affect it and its styles can't leak out. The stylesheet is attached through the CSSOM, so a strict Content-Security-Policy can't block it.
- **Lazy tree**: children are built when first unfolded, and large arrays and objects are paged, so big responses stay fast.
- **Safe rendering**: values from the page are always inserted as text, never as HTML.

## 🤝 How to contribute

[Contribution Guidelines](https://atc-net.github.io/introduction/about-atc#how-to-contribute)

[Coding Guidelines](https://atc-net.github.io/introduction/about-atc#coding-guidelines)
