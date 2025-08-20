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
    email: user.email || user.providerData[0].email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

const oauthClientId =
  '820825199730-3e2tk7rb9pq2d4uao2j16p5hr2p1usi6.apps.googleusercontent.com';

const performChromeLogin = async () => {
  console.log('performChromeLogin() called in background script');
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
  onAuthStateChanged(auth, async (user) => {
    // this handles the updates for performFirefoxGoogleLogin();
    // it should also handle it for chrome login, but doesn't for some reason?
    console.log('Auth state changed in background:', user?.displayName);

    const serialized = user ? toSerializedUser(user) : null;

    await storage.setItem('local:user', serialized);
    messaging.sendMessage('auth:stateChanged', serialized);

    /*
    // TODO / IMPORTANT !!!! for yb and rc:

    see this line below? VVVV
        await storage.setItem('local:isLoggedInGlobal', 1); 

    it  seems to run NO MATTER what in both chrome AND firefox.... like, before the user has even logged in
    yet we still have to do:
  await storage.setItem('local:user', serialized);
  messaging.sendMessage('auth:stateChanged', serialized);
    ^ those two lines, in the chrome login function?? no idea why - if these 2x lines are excluded, we get error 400
    (i verified this in testing by console.log() and changing isLoggedInGlobal to random values like 42 or 27 to see scope)

    // also, console.logging in this area (onAuthStateChanged) gives error 400? like wtf? but setting storage works... weird...

    */
  });

  messaging.onMessage('auth:getUser', async () => {
    const user =
      await storage.getItem<ReturnType<typeof toSerializedUser>>('local:user');
    console.log('in messaging, user:', user);
    return user;
  });

  messaging.onMessage('auth:signIn', async () => {
    /*
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
    */
    await performChromeLogin(); // ^ this function just does the above code, but it is here for clarity's sake of making it more obvious what is happening
    // TODO remove the giant blurb ^^ of /* */ if everything works as before (which it should, I'm just paranoid so putting this reminder here lol)

    await storage.setItem('local:isLoggedInGlobal', 1);
  });

  messaging.onMessage('auth:signInFirefox', async () => {
    // The onAuthStateChanged listener in the background script should handle the update (it does)
    await performFirefoxGoogleLogin();

    await storage.setItem('local:isLoggedInGlobal', 1);
  });

  messaging.onMessage('auth:signOut', async () => {
    // Let onAuthStateChanged handle null broadcast (it does, I think?)
    await storage.removeItem('local:user');
    await storage.removeItem('local:isLoggedInGlobal');
    messaging.sendMessage('auth:stateChanged');
    await signOut(auth);
  });

  messaging.onMessage('summarize:video', () => {
    const videoUrl =
      'https://www.youtube.com/watch?v=YpPGRJhOP8k&pp=ygUYYW1hemZpdCBiYWxhbmNlIDIgcmV2aWV3'; // temporary hardcoded URL for testing
    const summary = summarizeVideo(videoUrl);
    return summary;
  });
});
