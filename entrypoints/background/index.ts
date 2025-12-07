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

// Store unsubscribe functions to clean up listeners on logout
let unsubscribeFriendships: (() => void) | null = null;
let unsubscribeFriendRequests: (() => void) | null = null;
let unsubscribeSuggestedVideosSender: (() => void) | null = null;
let unsubscribeSuggestedVideosReceiver: (() => void) | null = null;

function stopListeners() {
  console.log('Cleaning up previous background listeners...');
  if (unsubscribeFriendships) {
    unsubscribeFriendships();
    unsubscribeFriendships = null;
  }
  if (unsubscribeFriendRequests) {
    unsubscribeFriendRequests();
    unsubscribeFriendRequests = null;
  }
  if (unsubscribeSuggestedVideosSender) {
    unsubscribeSuggestedVideosSender();
    unsubscribeSuggestedVideosSender = null;
  }
  if (unsubscribeSuggestedVideosReceiver) {
    unsubscribeSuggestedVideosReceiver();
    unsubscribeSuggestedVideosReceiver = null;
  }
}

async function startListeners(userId: string) {
  console.log('Starting background listeners for user:', userId);
  stopListeners(); // Ensure no duplicates

  // 1. Listen to Friendships
  unsubscribeFriendships = listenToFriendships(userId, async (snapshot) => {
    console.log('Friendship update detected in background.');
    // When friendships change, we re-fetch the profiles and update the cache
    await fetchAndCacheFriends();
  });

  // 2. Listen to Friend Requests
  unsubscribeFriendRequests = listenToFriendRequests(userId, (snapshot) => {
    const receivedRequests = snapshot.data()?.received || {};
    // Store directly to storage
    storage.setItem('local:friendRequests', receivedRequests);
    console.log('Friend requests updated in background:', Object.keys(receivedRequests).length);
  });

  // 3. Listen to Suggested Videos (Receiver)
  let initialReceiverLoad = true;
  unsubscribeSuggestedVideosReceiver = listenToSuggestedVideos(userId, 'receiver', async (snapshot) => {
    const videos: any[] = [];
    snapshot.forEach((doc: any) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    storage.setItem('local:suggestedVideos', videos);
    console.log('Suggested videos (receiver) updated in background:', videos.length);

    // Notification Logic
    if (!initialReceiverLoad) {
      snapshot.docChanges().forEach(async (change: any) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const fromUid = data.from;
          const videoTitle = data.title || 'a video';

          // Get sender name
          const friendsList = (await storage.getItem('local:friendsList')) || [];
          // @ts-ignore
          const friend = friendsList.find((f: any) => f.id === fromUid);
          const senderName = friend?.label || friend?.displayName || friend?.email || 'Someone';

          const notifId = await createBrowserNotification(
            `${senderName} just sent you a video!`, // <- 70 char limit for this one
            `Click to open: "${videoTitle}"`,
            true
          );

          console.log('Notification ID:', notifId);

          if (notifId && data.videoId) {
            console.log()
            const url = `https://www.youtube.com/watch?v=${data.videoId}`;
            notificationMap.set(String(notifId), url);
            console.log(notificationMap);
          }
        }
      });
    }
    initialReceiverLoad = false;
  });

  // 4. Listen to Suggested Videos (Sender) - Optional, but good for "Sent" tab
  unsubscribeSuggestedVideosSender = listenToSuggestedVideos(userId, 'sender', (snapshot) => {
    const videos: any[] = [];
    snapshot.forEach((doc: any) => {
      videos.push({ id: doc.id, ...doc.data() });
    });
    storage.setItem('local:sentVideos', videos);
    console.log('Sent videos updated in background:', videos.length);
  });
}

function createTab(url: string) {
  if (typeof browser !== "undefined" && browser.tabs) {
    // Firefox / Promise-based
    browser.tabs.create({ url }).then(tab => {
      console.log("created tab", tab);
    });
  } else if (typeof chrome !== "undefined" && chrome.tabs) {
    // Chrome / callback-based
    chrome.tabs.create({ url }, tab => {
      console.log("created tab", tab);
    });
  } else {
    throw new Error("tabs API not available");
  }
}


// ---------------------------
// NOTIFICATION CLICK HANDLER
// ---------------------------
const notificationMap = new Map<string, string>(); // ID -> URL
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log("notification clicked", notificationId);
});

browser.notifications.onClicked.addListener((notificationId) => {
  console.log("notification clicked", notificationId);
  if (notificationMap.has(notificationId)) {
    const url = notificationMap.get(notificationId);
    if (url) {
      createTab(url);
      //window.open("https://www.mozilla.org", "_blank");
    }
  }
});

async function waitForDBInitialization() {
  console.log('Waiting for Firestore initialization...');

  // Await the promise to ensure the object is available
  const db = await dbReadyPromise;

  const user = await storage.getItem<SerializedUser | null>('local:user');

  if (user?.uid) {
    console.log('Firestore is ready! Starting listeners for user:', user.uid);
    startListeners(user.uid);
  } else {
    console.log('Firestore is ready, but no user is logged in.');
  }
}

const performChromeLogin = async () => {
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

// Defined outside so startListeners can use it
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

export default defineBackground(() => {
  // ^ Executed when background is loaded
  onAuthStateChanged(auth, async (user) => {
    // This handles the updates for performFirefoxGoogleLogin(); and performChromeLogin();
    console.log('Auth state changed in background:', user?.displayName);

    const serialized = user ? toSerializedUser(user) : null;

    await storage.setItem('local:user', serialized);
    messaging.sendMessage('auth:stateChanged', serialized);

    if (user) {
      KeepAliveService.start();
      waitForDBInitialization(); // This will start listeners
    } else {
      stopListeners();
      KeepAliveService.stop();
    }
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
    stopListeners(); // Ensure listeners are stopped
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
