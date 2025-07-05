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
      console.log("Performing Firefox Google login (AuthContext.tsx)");
      await messaging.sendMessage("auth:signInFirefox");
    } else {
      console.log("Performing Chrome Google login (AuthContext.tsx)");
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
