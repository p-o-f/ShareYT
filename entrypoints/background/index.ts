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

function toSerializedUser(user: User): SerializedUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
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
      console.error('serializeUser: user is null, cannot serialize.');
    }

    // TODO: fix the below
    // manual work that should be handled by onAuthStateChanged but isn't for some reason
    await storage.setItem('local:user', serialized);
    messaging.sendMessage('auth:stateChanged', serialized);
    // end manual work that should be handled by onAuthStateChanged

    // TODO: no need to return anything
    return serialized;
  });

  messaging.onMessage('auth:signInFirefox', async () => {
    // The onAuthStateChanged listener in the background script should handle the update (TODO: verify this)
    await performFirefoxGoogleLogin();
  });

  messaging.onMessage('auth:signOut', async () => {
    // Let onAuthStateChanged handle null broadcast (TODO: verify this)
    await signOut(auth);
  });

  messaging.onMessage('summarize:video', () => {
    const videoUrl =
      'https://www.youtube.com/watch?v=YpPGRJhOP8k&pp=ygUYYW1hemZpdCBiYWxhbmNlIDIgcmV2aWV3'; // temporary hardcoded URL for testing
    const summary = summarizeVideo(videoUrl);
    return summary;
  });
});
