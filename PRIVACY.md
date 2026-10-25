# Privacy policy

ATC JSON Viewer is a browser extension for Chrome and Edge that formats JSON in the tab you click. This policy applies to the extension in the Chrome Web Store, in Microsoft Edge Add-ons and built from this repository.

## Summary

ATC JSON Viewer collects no data. It doesn't send anything anywhere, and the only thing it stores is your own settings, in your browser.

## What is collected

Nothing. The extension collects no personal information, no page content, no web addresses, no browsing history, no usage statistics and no error reports.

## What is sent

Nothing. The extension makes no network requests at all, so nothing is sent to its authors or to anyone else. Links you click in a formatted page open in a new tab, like any other link.

## What is stored

Only your settings for the viewer, such as theme, view, font size, unfold depth, sorting, and whether links, item counts, timestamps and JWT chips are shown. They are stored with `chrome.storage.local` in your browser profile on this device, are not synced to other devices, and are removed when you click **Reset to defaults** on the settings page or uninstall the extension.

No page content, web addresses or history are ever stored.

## Page content

When you click the toolbar icon (or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd>), the extension reads the text of that one tab to format it. The formatted page exists only in memory in that tab and is gone when you restore the page or leave it. JSON Web Tokens in a page are decoded in your browser, never sent anywhere.

## Sharing

Nothing is shared with, or sold to, anyone, because nothing is collected.

## Permissions

The extension asks for three permissions: `activeTab`, `scripting` and `storage`. [SECURITY.md](SECURITY.md) explains each one and how to check these claims yourself.

## Changes

Changes to this policy are made in this file, and its history on GitHub shows every version.

## Contact

Questions about this policy: open an issue at <https://github.com/atc-net-apps/atc-soft-json-viewer/issues>.
