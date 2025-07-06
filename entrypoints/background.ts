/// <reference lib="webworker" />
declare const clients: Clients;
import {
  onAuthStateChanged,
  User,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
} from 'firebase/auth';
import { PublicPath } from 'wxt/browser';
import { ai, auth } from '../utils/firebase';
import { getGenerativeModel } from 'firebase/ai';

//------------------------------------------------------------------------ AI setup stuff (for later)
const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });

async function summarizeVideo(videoUrl: string) {
  const prompt =
    'Summarize the following video and also output its title: ' + videoUrl;

  const result = await model.generateContent(prompt);

  const response = result.response;
  const text = response.text();
  console.log(text);
  return text;
}
//------------------------------------------------------------------------ End AI setup stuff

export type SerializedUser = Pick<
  User,
  'uid' | 'email' | 'displayName' | 'photoURL'
>;

function toSerializedUser(user: User): SerializedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    // emailVerified: user.emailVerified,
    // isAnonymous: user.isAnonymous,
    // providerData: user.providerData.map((p) => ({ ...p })),
  };
}

const oauthClientId =
  '820825199730-3e2tk7rb9pq2d4uao2j16p5hr2p1usi6.apps.googleusercontent.com';

const performFirefoxGoogleLogin = async () => {
  try {
    const nonce = Math.floor(Math.random() * 1000000);
    const redirectUri = browser.identity.getRedirectURL();

    console.log('Redirect URI:', redirectUri);

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: `https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&nonce=${nonce}&scope=openid%20profile&client_id=${oauthClientId}&redirect_uri=${redirectUri}`,
      interactive: true,
    });

    if (!responseUrl) {
      throw new Error('OAuth2 redirect failed : no response URL received.');
    }

    const idToken = responseUrl.split('id_token=')[1].split('&')[0];
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    // yb: i think The onAuthStateChanged listener in the background script will handle the update
    return result;
  } catch (err) {
    console.log(err);
    return null;
  }
};

export default defineBackground(() => {
  onAuthStateChanged(auth, async (user) => {
    console.log('Auth state changed in background:', user?.displayName);

    const serialized = user ? toSerializedUser(user) : null;

    await storage.setItem('local:user', serialized);
    messaging.sendMessage('auth:stateChanged', serialized);
  });

  messaging.onMessage('auth:getUser', async () => {
    const user =
      await storage.getItem<ReturnType<typeof toSerializedUser>>('local:user');
    console.log('in messaging, user:', user);
    return user;
  });

  messaging.onMessage('auth:signIn', async () => {
    const user = await firebaseAuth();

    const serialized = user ? toSerializedUser(user) : null;
    if (!serialized) {
      // logged out
      console.error('serializeUser: user is null, cannot serialize.');
      // throw new Error("serializeUser: user is null, cannot serialize.");
    }

    // manual work that should be handled by onAuthStateChanged but isn't for some reason TODO: fix this
    await storage.setItem('local:user', serialized);
    messaging.sendMessage('auth:stateChanged', serialized);
    // end manual work that should be handled by onAuthStateChanged
    // TODO: no need to return anything
    return serialized;
  });

  messaging.onMessage('auth:signInFirefox', async () => {
    await performFirefoxGoogleLogin();
    // The onAuthStateChanged listener in the background script will handle the update
  });

  messaging.onMessage('auth:signOut', async () => {
    await signOut(auth);
    // Let onAuthStateChanged handle null broadcast
  });

  messaging.onMessage('summarize:video', () => {
    const videoUrl =
      'https://www.youtube.com/watch?v=YpPGRJhOP8k&pp=ygUYYW1hemZpdCBiYWxhbmNlIDIgcmV2aWV3'; // temporary hardcoded URL for testing
    const summary = summarizeVideo(videoUrl);
    return summary;
  });
});

const OFFSCREEN_DOCUMENT_PATH = '/offscreen.html';
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
        justification: 'auth',
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
  const auth = await messaging.sendMessage('auth:chromeOffscreen');
  if (auth?.name === 'FirebaseError') return null;
  // throw auth;
  return auth as User;
}

async function firebaseAuth() {
  try {
    await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
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
    closeOffscreenDocument();
  }
}
