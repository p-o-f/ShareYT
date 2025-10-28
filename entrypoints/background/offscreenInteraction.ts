/// <reference lib="webworker" />
declare const clients: Clients;
import { isFirebaseUser } from '@/utils/firebase';
import { PublicPath } from 'wxt/browser';

export const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
let creatingOffscreenDocument: Promise<void> | null;
// Chrome only allows for a single offscreenDocument. This is a helper function
// that returns a boolean indicating if a document is already active.
export async function hasOffscreenDocument() {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  return (await clients.matchAll()).some(
    (c: Client) => c.url === browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
  );
}

export async function ensureOffscreenDocument(path: PublicPath) {
  // If we do not have a document, we are already setup and can skip
  if (!(await hasOffscreenDocument())) {
    // create offscreen document
    if (creatingOffscreenDocument) {
      await creatingOffscreenDocument;
    } else {
      creatingOffscreenDocument = browser.offscreen.createDocument({
        url: path,
        reasons: [browser.offscreen.Reason.DOM_SCRAPING],
        justification: 'auth',
      });
      await creatingOffscreenDocument;
      creatingOffscreenDocument = null;
    }
  }
}

export async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) return;
  await browser.offscreen.closeDocument();
}

async function getAuth() {
  const user = await messaging.sendMessage('auth:chromeOffscreen');
  if (user?.name === 'FirebaseError') {
    console.error('FirebaseError on offscreen authentication');
    return null;
  }
  if (!isFirebaseUser(user)) {
    console.error(
      'Some error occurred where the expected User object does not match Firebase User properties',
    );
    return null;
  }
  return user;
}

export async function firebaseAuth() {
  try {
    await ensureOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    const auth = await getAuth();
    console.log('User Authenticated:', auth);
    return auth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.code === 'auth/operation-not-allowed') {
      console.error('Enable an OAuth provider in the Firebase console.');
    } else {
      console.error('Authentication error:', err);
    }
    return null;
  } finally {
    await closeOffscreenDocument();
  }
}
