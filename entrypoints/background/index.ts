import {
  onAuthStateChanged,
  User,
  signOut,
  signInWithCredential,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { firebaseAuth } from './offscreenInteraction';
import { SerializedUser } from '@/types/types';
import { summarizeVideo } from './ai';
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  getDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { db, dbReadyPromise, hashEmail, functions } from '../../utils/firebase';
import { httpsCallable } from 'firebase/functions';

function toSerializedUser(user: User): SerializedUser {
  return {
    uid: user.uid,
    email: user.email || user.providerData[0].email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

const oauthClientId =
  '820825199730-3e2tk7rb9pq2d4uao2j16p5hr2p1usi6.apps.googleusercontent.com';

const performChromeLogin = async () => {
  /* OLD CODE, BUT IMPORTANT COMMENTS BELOW
  the following code is now deprecated because, for whatever reason, using await firebaseAuth() has two problems: 1) auth token is not persistent in all contexts (and seemingly impossible to extract for a manual bypass)
  AND... 
  2) it doesn't trigger the onAuthStateChanged listener in this background script (unknown reason!), which is a problem because it's necessary for Firestore security rules to "pick up" that the user has been auth'd
  so that db requests can be used in the dashboard's script (e.g. read request for recommend:video)
  - that is to say, doing "manual work that should be handled by onAuthStateChanged" won't cut it since the Firestore rules still wouldn't see the user as auth'd anyway
    - also, since the token is not reliably persisted in all contexts --> manual extraction or bypass attempts futile --> and Chrome seems like a black box in seeing where the token persists and where it doesn't

  NOTE:
  the performChromeLogin() and performFirefoxGoogleLogin() functions are still separate for future maintainability's sake, even though they can now be consolidated into one function
  - I'm not sure if future mv2 -> mv3 updates or whatever can mess it up, so keeping them separate for now

        const user = await firebaseAuth();

        const serialized = user ? toSerializedUser(user) : null;
        if (!serialized) {
          console.error('serializeUser: user is null, cannot serialize.');
        }

        // TODO: fix the below
        // manual work that should be handled by onAuthStateChanged but isn't for some reason
        await storage.setItem('local:user', serialized);
        messaging.sendMessage('auth:stateChanged', serialized);
        // end manual work that should be handled by onAuthStateChanged
        // TODO: ^no need to return anything if it should were handled by onAuthStateChanged, but it isn't...

        return serialized;
  */
  console.log('performChromeLogin() called in background script');
  try {
    const nonce = Math.floor(Math.random() * 1000000);
    const redirectUri = browser.identity.getRedirectURL();
    console.log('Redirect URI:', redirectUri);

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: `https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&nonce=${nonce}&scope=openid%20profile%20email&client_id=${oauthClientId}&redirect_uri=${redirectUri}`,
      interactive: true,
    });

    if (!responseUrl) {
      throw new Error('OAuth2 redirect failed : no response URL received.');
    }

    const idToken = responseUrl.split('id_token=')[1].split('&')[0];
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    // onAuthStateChanged listener in the background script will handle the update
    return result;
  } catch (err) {
    console.log(err);
    return null;
  }
};

const performFirefoxGoogleLogin = async () => {
  console.log('performFirefoxGoogleLogin() called in background script');
  try {
    const nonce = Math.floor(Math.random() * 1000000);
    const redirectUri = browser.identity.getRedirectURL();

    console.log('Redirect URI:', redirectUri);

    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: `https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&nonce=${nonce}&scope=openid%20profile%20email&client_id=${oauthClientId}&redirect_uri=${redirectUri}`,
      interactive: true,
    });

    if (!responseUrl) {
      throw new Error('OAuth2 redirect failed : no response URL received.');
    }

    const idToken = responseUrl.split('id_token=')[1].split('&')[0];
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    // onAuthStateChanged listener in the background script will handle the update
    return result;
  } catch (err) {
    console.log(err);
    return null;
  }
};

export default defineBackground(() => {
  // ^ Executed when background is loaded
  onAuthStateChanged(auth, async (user) => {
    // This handles the updates for performFirefoxGoogleLogin(); and performChromeLogin();
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
    // The onAuthStateChanged listener in the background script handles the update
    await performChromeLogin();
    await storage.setItem('local:isLoggedInGlobal', 1);
  });

  messaging.onMessage('auth:signInFirefox', async () => {
    // The onAuthStateChanged listener in the background script handles the update
    await performFirefoxGoogleLogin();
    await storage.setItem('local:isLoggedInGlobal', 1);
  });

  messaging.onMessage('auth:signOut', async () => {
    // Let onAuthStateChanged handle null broadcast (it does, I think?)
    await storage.removeItem('local:user');
    await storage.removeItem('local:isLoggedInGlobal');
    messaging.sendMessage('auth:stateChanged', null);
    await signOut(auth);
  });

  messaging.onMessage('summarize:video', () => {
    const videoUrl =
      'https://www.youtube.com/watch?v=YpPGRJhOP8k&pp=ygUYYW1hemZpdCBiYWxhbmNlIDIgcmV2aWV3'; // temporary hardcoded URL for testing
    const summary = summarizeVideo(videoUrl);
    return summary;
  });

  messaging.onMessage('recommend:video', ({ data }) => {
    console.log('in recommending video background');
    const suggestVideo = httpsCallable(functions, 'suggestVideo');
    suggestVideo({
      videoId: data!.videoId,
      to: data!.to,
      thumbnailUrl: data!.thumbnailUrl,
      title: data!.title,
    });
  });
});

async function waitForDBInitialization() {
  console.log('Waiting for Firestore initialization...');

  // Await the promise to ensure the object is available
  const db = await dbReadyPromise;

  console.log('Firestore is ready! Starting listeners...');

  // NOW you can safely use the db object
  // ... Firestore operations ...
}

waitForDBInitialization();
