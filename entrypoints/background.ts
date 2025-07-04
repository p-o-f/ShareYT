/// <reference lib="webworker" />
import { PublicPath } from "wxt/browser";

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });
  browser.runtime.onMessage.addListener(authListener);
});

const OFFSCREEN_DOCUMENT_PATH = "/offscreen.html";

let creatingOffscreenDocument: Promise<void> | null;

// Chrome only allows for a single offscreenDocument. This is a helper function
// that returns a boolean indicating if a document is already active.
async function hasOffscreenDocument() {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  return (await clients.matchAll()).some(
    (c: Client) => c.url === browser.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
  );
}

async function setupOffscreenDocument(path: PublicPath) {
  // If we do not have a document, we are already setup and can skip
  if (!(await hasOffscreenDocument())) {
    // create offscreen document
    if (creatingOffscreenDocument) {
      await creatingOffscreenDocument;
    } else {
      creatingOffscreenDocument = browser.offscreen.createDocument({
        url: path,
        reasons: [browser.offscreen.Reason.DOM_SCRAPING],
        justification: "auth",
      });
      await creatingOffscreenDocument;
      creatingOffscreenDocument = null;
    }
  }
}

async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) {
    return;
  }
  await browser.offscreen.closeDocument();
}

async function getAuth() {
  const auth = await browser.runtime.sendMessage({
    type: "firebase-auth",
    target: "offscreen",
  });

  if (auth?.name === "FirebaseError") {
    throw auth;
  }

  return auth;
}

async function firebaseAuth() {
  try {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);

    const auth = await getAuth();
    console.log("User Authenticated", auth);
    return auth;
  } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
    console.error("Bruh", err);
    if (err.code === "auth/operation-not-allowed") {
      console.error(
        "You must enable an OAuth provider in the Firebase console to use signInWithPopup. This sample uses Google by default.",
      );
    } else {
      console.error("Authentication error:", err);
    }

    return null;
  } finally {
    closeOffscreenDocument();
  }
}

function authListener(
  message: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  _sender: Browser.runtime.MessageSender,
  sendResponse: (response?: any) => void, // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  if (message.action == "signIn") {
    firebaseAuth().then((auth) => {
      sendResponse(auth);
    });
  }
  return true;
}
