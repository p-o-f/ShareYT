/**
 * https://developer.chrome.com/blog/longer-esw-lifetimes/
 *
 * To keep the service worker alive, we set up a periodic task using browser api that runs every 20 seconds.
 * This is only needed for Chrome (mv3) since Firefox still supports both mv2 and mv3 with persistent background scripts (I'm only supporting mv2 for Firefox for now).
 *
 * This task performs a lightweight operation (fetching platform info) to prevent
 * the service worker from being terminated due to inactivity (mv3 thing where bg context is not persistent and must be bypassed)
 *
 * [IMPORTANT]: The logic for how keepServiceWorkerAlive() will probably need to be updated in the future if Chrome changes their policies again, which is why this gets its own section in the codebase (as part of the listeners file).
 * Other references:
 * https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/virtual/utils/keep-service-worker-alive.ts
 * https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension
 */

// Private State
let keepAliveInterval: ReturnType<typeof setInterval> | undefined;
let keepAliveRunning = false; // Internal flag to prevent overlapping interval executions - ensures the async callback never overlaps, even if getPlatformInfo() is slow or temporarily hanggs

// Public API
/* example usage:

export default defineBackground(() => {
  console.log("Background started!");
  KeepAliveService.start();

  // Optional cleanup
  return () => {
    KeepAliveService.stop();
  };
});

*/
export const KeepAliveService = {
  async start() {
    // prevent multiple intervals from stacking
    if (keepAliveInterval) return; // Already running
    await storage.setItem('local:keepAliveStarted', true);

    keepAliveInterval = setInterval(async () => {
      if (keepAliveRunning) return; // skip if previous tick still running
      keepAliveRunning = true;

      try {
        const info = await browser.runtime.getPlatformInfo();
        console.log('Keep-alive tick:', info.os);
      } catch (err) {
        console.warn('Keep-alive failed:', err);
      } finally {
        keepAliveRunning = false;
      }
    }, 20_000); // every 20 sec
  },

  async stop() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = undefined;
      await storage.setItem('local:keepAliveStarted', false);
      console.log('Keep-alive stopped.');
    }
  },

  isRunning(): boolean {
    return !!keepAliveInterval;
  },
};
