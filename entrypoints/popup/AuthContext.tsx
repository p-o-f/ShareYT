import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { GoogleAuthProvider, signInWithCredential, User } from "firebase/auth";
import { auth } from "../../utils/firebase";
import { messaging } from "../../utils/messaging";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("context is undefined");
  }
  return context;
};

const oauthClientId =
  "820825199730-3e2tk7rb9pq2d4uao2j16p5hr2p1usi6.apps.googleusercontent.com"; // from gcp

export const isFirefoxExtension = () => {
  return location.protocol === "moz-extension:";
};

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("IN AUTHPROVIDER");
    messaging.sendMessage("auth:getUser").then((user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    const unsubscribe = messaging.onMessage("auth:stateChanged", ({ data }) => {
      setCurrentUser(data);
      console.log(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    if (isFirefoxExtension()) {
      try {
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

        const idToken = responseUrl.split("id_token=")[1].split("&")[0];
        const credential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, credential);
        // i think The onAuthStateChanged listener in the background script will handle the update
        // setCurrentUser(result.user);
      } catch (err) {
        console.log(err);
      }
    } else {
      await messaging.sendMessage("auth:signIn");
    }
  };

  const logout = async () => {
    await messaging.sendMessage("auth:signOut");
    setCurrentUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    loginWithGoogle,
    logout,
  };
  console.log("AuthContextProvider User", value.user?.displayName);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
