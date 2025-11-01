// Currently unused - we don't need an offscreen doc because we can force the background to be persistent
// (not that performance heavy for our use case) using the keep-alive technique implemented in utils/listeners.ts

/*
const _URL = 'https://video-sync-10531.web.app/signInWithPopup.html';
const iframe = document.createElement('iframe');
iframe.src = _URL;
document.documentElement.appendChild(iframe);
messaging.onMessage('auth:chromeOffscreen', handleChromeMessages);

function handleChromeMessages() {
  return new Promise((resolve, reject) => {
    function handleIframeMessage({ data }) {
      try {
        if (typeof data === 'string' && data.startsWith('!_{')) return;
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;

        globalThis.removeEventListener('message', handleIframeMessage);
        resolve(parsed.user);
      } catch (e) {
        console.log(`json parse failed for data: ${data}`, e);
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
*/
