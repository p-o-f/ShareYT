import { VideoRecommendation, SerializedUser } from '@/types/types';
import { defineExtensionMessaging } from '@webext-core/messaging';

interface MessagingProtocol {
  // UI->Background messages
  'auth:signIn': () => void;
  //'auth:signIn': () => SerializedUser | null; <---------- OLD version of ^, see background/index.ts to see why it was changed
  'auth:signInFirefox': () => void;
  'auth:signOut': () => void;
  'auth:getUser': () => SerializedUser | null;
  'summarize:video': () => string;

  // Background->UI messages
  'auth:stateChanged': (user: SerializedUser | null) => void;

  // Background->Offscreen messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'auth:chromeOffscreen': () => Promise<any>;
  // Background->Offscreen control messages
  'offscreen:startListeners': (uid: string) => void;

  // content->background
  'recommend:video': (recc: VideoRecommendation | null) => void;
}

export const messaging = defineExtensionMessaging<MessagingProtocol>();
