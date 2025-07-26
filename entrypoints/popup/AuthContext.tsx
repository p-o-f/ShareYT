import { createContext, ReactNode } from 'react';
import { messaging } from '../../utils/messaging';
import { SerializedUser } from '@/types/types';

interface AuthContextType {
  user: SerializedUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('context is undefined');
  }
  return context;
};

export const isFirefoxExtension = () => {
  return location.protocol === 'moz-extension:';
};

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setCurrentUser] = useState<SerializedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('IN AUTHPROVIDER');
    messaging.sendMessage('auth:getUser').then((user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    const unsubscribe = messaging.onMessage('auth:stateChanged', ({ data }) => {
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
      console.log(
        "Performing Firefox Google login (AuthContext.tsx), aka await messaging.sendMessage('auth:signInFirefox');",
      );
      await messaging.sendMessage('auth:signInFirefox');
    } else {
      console.log(
        "Performing Chrome Google login (AuthContext.tsx), aka await messaging.sendMessage('auth:signIn');",
      );
      await messaging.sendMessage('auth:signIn');
    }
  };

  const logout = async () => {
    console.log(
      "Performing Google logout (AuthContext.tsx), aka await messaging.sendMessage('auth:signOut');",
    );
    await messaging.sendMessage('auth:signOut');
    setCurrentUser(null);
    browser.storage.sync.set({ isLoggedIn: false }); // needed for index.ts content script to check if it's logged in, kinda like a zepp settingsstorage or whatever type thing where this is shared storage
  };

  const value: AuthContextType = {
    user,
    loading,
    loginWithGoogle,
    logout,
  };
  console.log('AuthContextProvider User', value.user?.displayName);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
