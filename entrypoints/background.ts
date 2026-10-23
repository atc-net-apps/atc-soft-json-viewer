// The service worker. It sleeps until the user clicks the toolbar button
// or presses Alt+Shift+J (manifest `commands._execute_action`), which both fire `action.onClicked`.
export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) {
      return;
    }

    try {
      // activeTab grants access to this tab for this click only; scripting lets us run code in it.
      const [result] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.contentType,
      });
      console.log('ATC JSON Viewer: content type of the clicked tab is', result?.result, { url: tab.url });
    } catch (error) {
      // Browser pages (chrome://, edge://, the web stores) never allow extensions to run code.
      console.warn('ATC JSON Viewer: cannot read this tab', { url: tab.url, error });
    }
  });
});
