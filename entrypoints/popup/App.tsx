import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithCredential } from "firebase/auth";
import { auth } from "@/utils/firebase";

const oauthclientId = "820825199730-3e2tk7rb9pq2d4uao2j16p5hr2p1usi6.apps.googleusercontent.com"; // from gcp 

export const isFirefoxExtension = () => {
  return location.protocol === "moz-extension:";
};

type ResponseStatus = "success" | "error";

type UserData = {
  id: string;
  username: string | null;
  idToken: string;
};

const loginWithGoogle = async (
  background: boolean,
  oauthClientId: string
): Promise<{
  accessToken?: string;
  idToken?: string;
  status: ResponseStatus;
  userData?: UserData;
}> => {
  if (background) {
    return { status: "error" };
  }

  try {

    if (isFirefoxExtension()) {
      const nonce = Math.floor(Math.random() * 1000000);
      const redirectUri = browser.identity.getRedirectURL();
      
      console.log("Redirect URI:", redirectUri);

      const responseUrl = await browser.identity.launchWebAuthFlow({
        url: `https://accounts.google.com/o/oauth2/v2/auth?response_type=id_token&nonce=${nonce}&scope=openid%20profile&client_id=${oauthClientId}&redirect_uri=${redirectUri}`,
        interactive: true,
      });

      if (!responseUrl) {
        throw new Error("OAuth2 redirect failed : no response URL received.");
      }

      // Parse the response url for the id token
      const idToken = responseUrl.split("id_token=")[1].split("&")[0];
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);

    } else {
      browser.runtime.sendMessage({ action: "signIn" }, (res) => { console.log("handle", res) })
    }

    const user = auth.currentUser;
    const idToken = await user?.getIdToken();
    user?.displayName;

    if (!user || !idToken) {
      return { status: "error" };
    }

    const userData: UserData = {
      id: user.uid,
      username: user.displayName,
      idToken,
    };
    userData.idToken = idToken;

    return { idToken, userData, status: "success" };

  } catch (err) {
    console.error("Login error:", err);
    return { status: "error" };
  }
};

function App() {
  const [status, setStatus] = useState<ResponseStatus>("success");
  const [userData, setUserData] = useState<UserData | undefined>();

  const handleLogin = async () => {
    const res = await loginWithGoogle(false, oauthclientId);
    setStatus(res.status);
    setUserData(res.userData);
  };

  return (
    <>
      <h1>Login Demo - below is manifest version</h1>
      <h1>{import.meta.env.MANIFEST_VERSION}</h1>
      <p>Status: {status}</p>
      {userData && (
        <div>
          <p>Welcome, {userData.username}</p>
          <p>User ID: {userData.id}</p>
        </div>
      )}
      <button onClick={handleLogin}>Login with Google</button>
    </>
  );
}

export default App;
