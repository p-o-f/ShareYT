import { SerializedUser } from '@/entrypoints/background';
import { defineExtensionMessaging } from '@webext-core/messaging';

interface MessagingProtocol {
  // UI->Background messages
  'auth:signIn': () => SerializedUser | null;
  'auth:signInFirefox': () => void;
  'auth:signOut': () => void;
  'auth:getUser': () => SerializedUser | null;
  'summarize:video': () => string;
  // Background->UI messages
  'auth:stateChanged': (user: SerializedUser | null) => void;
  // Background->Offscreen messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'auth:chromeOffscreen': () => Promise<any>;
}

export const messaging = defineExtensionMessaging<MessagingProtocol>();
