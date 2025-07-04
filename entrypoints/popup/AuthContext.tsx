import { createContext, ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  User,
} from "firebase/auth";
import { auth } from "../../utils/firebase";

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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("!!!! FirebaseAuthChanged", u?.displayName ?? "none");
      setCurrentUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
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
        setCurrentUser(result.user);
      } catch (err) {
        console.log(err);
      }
    } else {
      browser.runtime.sendMessage({ action: "signIn" }, (res) => {
        console.log("handle", res);
      });
    }
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    loginWithGoogle,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
