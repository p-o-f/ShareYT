import { createContext, ReactNode } from 'react';
import { messaging } from '../../utils/messaging';
import { SerializedUser } from '@/types/types';
import LoginForm from './LoginForm';

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
    if (user) {
      //console.log(user.email, user.displayName, user.photoURL);

      await storage.setItem('sync:isLoggedIn', true);
      await storage.setItem('sync:userStringify', JSON.stringify(user));
      await storage.setItem('sync:userEmail', user.email);
      await storage.setItem('sync:userDisplayName', user.displayName);
      await storage.setItem('sync:userPhotoURL', user.photoURL);

      /*
      For future reference, because I got confused on this before, there's 3x types of storage:
      localStorage.getItem()	<--- DOM Web API, only can be used in popup/options pages
      browser.storage.local.get() and browser.storage.sync.get() <--- both part of WebExtension Storage API; also sync has call limits apparently
      storage.getItem() <--- WXT helper which runs pretty much everywhere, best to use compared to the other 2 for simplicity

      ^ for storage.getItem, you do storage.getItem('type:key', 'value)
      where 'type' == 'local' or 'sync' or 'session' or 'managed'

      more about the types (thx GPT!):
        -local:
        Maps to: browser.storage.local
        Scope: Data stored locally on the device only
        Persistence: Persistent until explicitly cleared (even if the browser closes)
        Storage size: Usually large (around 5MB or more, depending on the browser)
        Use case: Storing extension data that doesn't need to sync, like caches, user preferences, temporary data, or large blobs

        -sync:
        Maps to: browser.storage.sync
        Scope: Data is synced across all browsers where the user is signed in (e.g., Firefox Sync, Chrome Sync)
        Persistence: Persistent and synced automatically
        Storage size: Smaller quota (about 100KB total, limits on write frequency)
        Use case: User preferences or settings that should roam with the user across devices, like theme choice, toolbar settings, or saved bookmarks

        -session:
        Maps to: browser.storage.session (relatively new, e.g., Firefox 106+)
        Scope: Data stored only for the lifetime of the browser session (i.e., cleared when the browser closes)
        Persistence: Temporary, lost on browser close
        Storage size: Similar to local, but ephemeral
        Use case: Temporary session data like current state, in-progress operations, or transient flags that don’t need to persist across restarts

        -managed:
        Maps to: browser.storage.managed
        Scope: Read-only storage controlled by enterprise policies or system administrators
        Persistence: Persistent, but user cannot modify it
        Use case: Settings or configurations pushed by IT/admin in enterprise environments, like mandatory homepage URLs, disabled features, or managed preferences
      */
    }
  };

  const logout = async () => {
    console.log(
      "Performing Google logout (AuthContext.tsx), aka await messaging.sendMessage('auth:signOut');",
    );
    await messaging.sendMessage('auth:signOut');
    if (user) {
      await storage.setItem('sync:isLoggedIn', false);
      await storage.setItem('sync:userStringify', '');
      await storage.setItem('sync:userEmail', '');
      await storage.setItem('sync:userDisplayName', '');
      await storage.setItem('sync:userPhotoURL', '');
      setCurrentUser(null);
    }
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
