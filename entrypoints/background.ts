/// <reference lib="webworker" />
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { PublicPath } from "wxt/browser";
import { auth } from "../utils/firebase";

export default defineBackground(() => {
  onAuthStateChanged(auth, (user) => {
    console.log("Auth state changed in background:", user?.displayName);
    storage.setItem("local:user", user);
    messaging.sendMessage("auth:stateChanged", user);
  });

  messaging.onMessage("auth:getUser", async () => {
    const user = await storage.getItem<User>("local:user");
    console.log("in messaging, user:", user);
    return user;
  });

  messaging.onMessage("auth:signIn", async () => {
    return await firebaseAuth();
  });

  messaging.onMessage("auth:signOut", async () => {
    await signOut(auth);
    // onAuthStateChanged will fire and handle broadcasting the null user
  });
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
  const auth = await messaging.sendMessage("auth:chromeOffscreen");
  if (auth?.name === "FirebaseError") {
    // throw auth;
    return null;
  }
  return auth as User;
}

async function firebaseAuth() {
  try {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    const auth = await getAuth();
    console.log("User Authenticated", auth);
    return auth;
  } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
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
