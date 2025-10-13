import { getAI, GoogleAIBackend } from 'firebase/ai';
import { FirebaseOptions, initializeApp } from 'firebase/app';
import { getAuth, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { sha256 } from 'js-sha256';
import { getFunctions } from 'firebase/functions';
import {
  // imports for Firestore initialization and multi-tab persistence
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyD_YP_cl_lI4eCHTWzuN5_Bjiyb_Y4z7TQ',
  authDomain: 'video-sync-10531.firebaseapp.com',
  projectId: 'video-sync-10531',
  storageBucket: 'video-sync-10531.firebasestorage.app',
  messagingSenderId: '820825199730',
  appId: '1:820825199730:web:13c7ac7ace788a95cb5eeb',
  measurementId: 'G-78R129K63L',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  // 1. Specify the local cache (IndexedDB)
  localCache: persistentLocalCache({
    // 2. Enable multi-tab coordination
    tabManager: persistentMultipleTabManager(),

    // Optional: You can set cacheSizeBytes here if needed,
    // but the default is usually fine for most apps.
  }),
});

// Since persistence is configured on creation, we don't need to await
// a separate persistence function. We can export the DB instance directly,
// or wrap it to ensure the *core Firebase app* itself is ready.
// For most background scripts, exporting the initialized instance is sufficient.
export const dbReadyPromise = Promise.resolve(db);

export const functions = getFunctions(app);
export const ai = getAI(app, { backend: new GoogleAIBackend() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFirebaseUser(user: any): user is User {
  return (
    typeof user === 'object' &&
    user !== null &&
    typeof user.uid === 'string' &&
    'email' in user &&
    'displayName' in user &&
    'photoURL' in user &&
    'emailVerified' in user &&
    'isAnonymous' in user &&
    Array.isArray(user.providerData)
  );
}

// Key for the recommendation
export function generateUUID() {
  return crypto.randomUUID(); // Available in modern browsers
}

export function hashEmail(email: string): string {
  return sha256(email.trim().toLowerCase());
}
