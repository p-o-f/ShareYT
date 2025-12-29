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
  'friends:get': () => any[]; // Add this line
  'friends:updateCache': () => void;
  'notification:create': (
    title: string,
    message: string,
    isClickable: boolean,
  ) => void;

  // Background->UI messages
  'auth:stateChanged': (user: SerializedUser | null) => void;

  // Background->Offscreen messages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  'auth:chromeOffscreen': () => Promise<any>;

  // content->background
  'recommend:video': (
    recc: {
      videoId: string | null;
      to: string[];
      thumbnailUrl: string;
      title: string;
      reaction?: string;
    } | null,
  ) => void;
  'video:delete': (data: { suggestionId: string }) => void;
  'video:updateReaction': (data: {
    suggestionId: string;
    reaction: string;
  }) => void;
}

export const messaging = defineExtensionMessaging<MessagingProtocol>();
