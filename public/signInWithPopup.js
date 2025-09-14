// import { signInWithPopup, GoogleAuthProvider, getAuth } from "firebase/auth";
// import { initializeApp } from "firebase/app";
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app-check.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD_YP_cl_lI4eCHTWzuN5_Bjiyb_Y4z7TQ',
  authDomain: 'video-sync-10531.firebaseapp.com',
  projectId: 'video-sync-10531',
  storageBucket: 'video-sync-10531.firebasestorage.app',
  messagingSenderId: '820825199730',
  appId: '1:820825199730:web:13c7ac7ace788a95cb5eeb',
  measurementId: 'G-78R129K63L',
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 👇 Enable debug token
// This has to be set *before* calling initializeAppCheck
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = '...'; // DO NOT COMMIT THIS LINE

// // Initialize App Check with reCAPTCHA v3
// initializeAppCheck(app, {
//   provider: new ReCaptchaV3Provider('6LfCtZkrAAAAAGg8ZFkwF3IwNxZAeag3UA36KpKC'),
//   isTokenAutoRefreshEnabled: true,
// });

// This code runs inside of an iframe in the extension's offscreen document.
// This gives you a reference to the parent frame, i.e. the offscreen document.
// You will need this to assign the targetOrigin for postMessage.
const PARENT_FRAME = document.location.ancestorOrigins[0];

const PROVIDER = new GoogleAuthProvider();

function sendResponse(result) {
  globalThis.parent.self.postMessage(JSON.stringify(result), PARENT_FRAME);
}

globalThis.addEventListener('message', function ({ data }) {
  if (data.initAuth) {
    signInWithPopup(auth, PROVIDER).then(sendResponse).catch(sendResponse);
  }
});
