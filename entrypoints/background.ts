import { isOpenSettings } from '@/src/messages';
import type { ToggleResult } from '@/src/mount';

const NOTICE_MS = 2000;

// The service worker. It sleeps until the user clicks the toolbar button
// or presses Alt+Shift+J (manifest `commands._execute_action`), which both fire `action.onClicked`.
export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) {
      return;
    }

    try {
      // activeTab grants access to this tab for this click only; scripting lets us inject the viewer.
      const [injection] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/viewer.js'],
      });
      const result = injection?.result as ToggleResult | undefined;
      if (result === 'not-json') {
        await showNotice(tab.id, "This page isn't JSON");
      }
    } catch (error) {
      // Browser pages (chrome://, edge://, the web stores) never allow extensions to run code.
      console.warn('ATC JSON Viewer: cannot run on this tab', { url: tab.url, error });
      await showNotice(tab.id, "ATC JSON Viewer can't run on this page");
    }
  });

  // The ⚙ button in the viewer asks for the settings page.
  browser.runtime.onMessage.addListener((message, sender) => {
    if (isOpenSettings(message, sender.id, browser.runtime.id)) {
      browser.runtime.openOptionsPage().catch(() => {});
    }
  });
});

/** Shows "–" on the toolbar icon, with an explanation as its tooltip, for a moment. Only on this tab. */
async function showNotice(tabId: number, message: string): Promise<void> {
  const defaultTitle = browser.runtime.getManifest().action?.default_title ?? '';
  await browser.action.setBadgeBackgroundColor({ tabId, color: '#5a6575' });
  await browser.action.setBadgeText({ tabId, text: '–' });
  await browser.action.setTitle({ tabId, title: message });

  setTimeout(() => {
    // The tab may have been closed meanwhile; then there is nothing to reset.
    browser.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    browser.action.setTitle({ tabId, title: defaultTitle }).catch(() => {});
  }, NOTICE_MS);
}
