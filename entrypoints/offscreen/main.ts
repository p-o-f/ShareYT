const _URL = 'https://video-sync-10531.web.app/signInWithPopup.html';
const iframe = document.createElement('iframe');
iframe.src = _URL;
document.documentElement.appendChild(iframe);
messaging.onMessage('auth:chromeOffscreen', handleChromeMessages);

function handleChromeMessages() {
  return new Promise((resolve, reject) => {
    function handleIframeMessage(ev: MessageEvent) {
      try {
        const { data } = ev;
        if (typeof data === 'string' && data.startsWith('!_{')) return;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;

        globalThis.removeEventListener('message', handleIframeMessage);
        resolve(parsed.user);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`json parse failed - ${msg}`);
        reject(e);
      }
    }

    globalThis.addEventListener('message', handleIframeMessage, false);
    iframe?.contentWindow?.postMessage(
      { initAuth: true },
      new URL(_URL).origin,
    );
  });
}

// Background requests to start long-lived listeners in the offscreen context
messaging.onMessage('offscreen:startListeners', async ({ data: uid }) => {
  try {
    console.log('[offscreen] startListeners for uid:', uid);
    // TODO: Initialize Firestore listeners here (e.g., friendships) using the same utils/firebase config
    // This offscreen page remains open to keep listeners active while the browser is running.
  } catch (e) {
    console.error('[offscreen] failed to start listeners', e);
  }
});
