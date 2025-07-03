import './App.css';
import { browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signInWithCredential } from 'firebase/auth';
import { auth } from '@/utils/firebase';

export const isFirefoxExtension = () => {
  return location.protocol === "moz-extension:";
};

function App() {
  // https://firebase.google.com/docs/auth/web/chrome-extension
  const handleLogin = () => {
    if (import.meta.env.MANIFEST_VERSION == 2) {
      // specifically firefox still uses v2, but firebase doesn't support it like chrome (? lol)
      console.log(browser.runtime.getManifest().oauth2)
      const provider = new GoogleAuthProvider();
      signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } else {
      browser.runtime.sendMessage({ action: "signIn" }, (res) => { console.log("handle", res) })
    }
  }
  return (
    <>
      <h1>yo</h1>
      <h1>{import.meta.env.MANIFEST_VERSION}</h1>
      <button onClick={handleLogin}>Login</button>
    </>
  );
}

export default App;
