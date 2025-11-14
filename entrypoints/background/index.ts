import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  User,
} from 'firebase/auth';
import { auth, db, dbReadyPromise, functions } from '../../utils/firebase';
import { SerializedUser } from '@/types/types';
import { doc, getDoc } from 'firebase/firestore';
import { summarizeVideo } from './ai';
import { httpsCallable } from 'firebase/functions';
import {
  KeepAliveService,
  listenToFriendships,
  listenToFriendRequests,
  listenToSuggestedVideos,
} from '@/utils/listeners';
import { createBrowserNotification } from '@/utils/notifications';

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

async function waitForDBInitialization() {
  console.log('Waiting for Firestore initialization...');

  // Await the promise to ensure the object is available
  const db = await dbReadyPromise;

  const user = await storage.getItem<SerializedUser | null>('local:user');

  if (user?.uid) {
    console.log('Firestore is ready! Starting listeners for user:', user.uid);
    //TODO: start listeners here
    // You can start your listeners here now that the user is confirmed and DB is ready.
    // For example:
    // listenToFriendships(user.uid, (snapshot) => { ... });
  } else {
    console.log('Firestore is ready, but no user is logged in.');
  }
}

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
    KeepAliveService.start();
    waitForDBInitialization();
    // Listeners will be started in waitForDBInitialization if user exists
  });

  async function fetchAndCacheFriends() {
    const user = await storage.getItem<SerializedUser>('local:user');
    if (!user?.uid) return [];

    try {
      const friendshipDoc = await getDoc(doc(db, 'friendships', user.uid));
      const friendMap = friendshipDoc.data()?.friends || {};
      const friendUids = Object.keys(friendMap);

      if (friendUids.length === 0) {
        // case where user has empty friends list
        await storage.setItem('local:friendsList', []);
        return [];
      }

      // Old: singular getUserProfile calls
      /*
      const getUserProfile = httpsCallable(functions, 'getUserProfile');
      const profilePromises = friendUids.map((uid) => getUserProfile({ uid }));
      const profiles = await Promise.all(profilePromises);

      const friendsList = profiles.map((p: any, i) => ({
        id: friendUids[i],
        label: p.data.displayName || p.data.email,
        img: p.data.photoURL || 'https://www.gravatar.com/avatar?d=mp',
      }));

      await storage.setItem('local:friendsList', friendsList);
      return friendsList;
      */

      // New: batchGetUserProfiles call
      const batchGetUserProfiles = httpsCallable(
        functions,
        'batchGetUserProfiles',
      );
      const res = await batchGetUserProfiles({ uids: friendUids });
      const { users, notFound } = (res.data ?? {}) as {
        users: Array<{
          uid: string;
          displayName?: string | null;
          email?: string | null;
          photoURL?: string | null;
        }>;
        notFound?: string[];
      };

      if (Array.isArray(notFound) && notFound.length > 0) {
        console.error('Some UIDs not found in Auth:', notFound);
      }

      const friendsList =
        (users ?? []).map((u) => ({
          id: u.uid,
          label: u.displayName || u.email || u.uid,
          img: u.photoURL || 'https://www.gravatar.com/avatar?d=mp',
        })) || [];

      await storage.setItem('local:friendsList', friendsList);
      return friendsList;
    } catch (e) {
      console.error('Error fetching friends in background:', e);
      return [];
    }
  }

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

  // Purpose: To get the friends list when there is nothing in the cache. This is the "cold start" or "first time" scenario.
  messaging.onMessage('friends:get', async () => {
    return fetchAndCacheFriends(); // This message is the "I need data now, and I'm willing to wait for it" request.
  });

  // Purpose: To silently refresh the cache in the background when the UI has already displayed cached data. This is the "warm start" or "subsequent clicks" scenario.
  messaging.onMessage('friends:updateCache', async () => {
    await fetchAndCacheFriends(); // This message is the "Hey, I'm just letting you know it's a good time to refresh the data for next time, but don't make me wait" request.
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
    if (data && data.to && Array.isArray(data.to)) {
      suggestVideo({
        videoId: data.videoId,
        toUids: data.to, // Pass array of UIDs
        thumbnailUrl: data.thumbnailUrl,
        title: data.title,
      });
    }
  });

  messaging.onMessage('notification:create', ({ data }) => {
    const { title, message, isClickable } = data;
    createBrowserNotification(title, message, isClickable);
  });
});
