/// <reference lib="webworker" />
declare const clients: Clients;
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { PublicPath } from "wxt/browser";
import { auth } from "../utils/firebase";

// Serialize the Firebase user into a structured cloneable object (mv2 needs this ig)
function safeUser(user: User) { 
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    providerData: user.providerData.map((p) => ({ ...p })),
  };
}

export default defineBackground(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    console.log("Auth state changed in background:", user?.displayName);

    // debug serialization
    try {
      console.log("user payload", JSON.stringify(user));
    } catch (err) {
      console.error("Failed to JSON.stringify user:", err);
    }

    const serialized = user ? safeUser(user) : null;

    await storage.setItem("local:user", serialized);
    messaging.sendMessage("auth:stateChanged", serialized);
  });

  messaging.onMessage("auth:getUser", async () => {
    const user = await storage.getItem<ReturnType<typeof safeUser>>("local:user");
    console.log("in messaging, user:", user);
    return user;
  });

  messaging.onMessage("auth:signIn", async () => {
    const user = await firebaseAuth();
    const serialized = user ? safeUser(user) : null;

    await storage.setItem("local:user", serialized);
    messaging.sendMessage("auth:stateChanged", serialized);

    return serialized;
  });

  messaging.onMessage("auth:signOut", async () => {
    await signOut(auth);
    // Let onAuthStateChanged handle null broadcast
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
  if (!(await hasOffscreenDocument())) return;
  await browser.offscreen.closeDocument();
}

async function getAuth() {
  const auth = await messaging.sendMessage("auth:chromeOffscreen");
  if (auth?.name === "FirebaseError") return null;
  // throw auth;
  return auth as User;
}

async function firebaseAuth() {
  try {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
    const auth = await getAuth();
    console.log("User Authenticated:", auth);
    return auth;
  } catch (err: any) {
    if (err.code === "auth/operation-not-allowed") {
      console.error("Enable an OAuth provider in the Firebase console.");
    } else {
      console.error("Authentication error:", err);
    }
    return null;
  } finally {
    closeOffscreenDocument();
  }
}
