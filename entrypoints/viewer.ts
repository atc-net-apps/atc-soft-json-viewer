import { toggleViewer } from '@/src/mount';

// Injected into the clicked tab by the background (output: /viewer.js).
// Returns 'formatted', 'restored' or 'not-json' to the background.
export default defineUnlistedScript({
  // Makes the return value of main() the script's result, which executeScript passes back.
  globalName: true,
  main: () => toggleViewer(),
});
