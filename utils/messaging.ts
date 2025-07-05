import { defineExtensionMessaging } from "@webext-core/messaging";
import type { User } from "firebase/auth";

export type ExtUserInfo = Pick<User, "displayName" | "photoURL" | "email">;
interface MessagingProtocol {
  // UI->Background messages
  "auth:signIn": () => User | null;
  "auth:signInFirefox": () => Promise<User | null>;
  "auth:signOut": () => Promise<void>;
  "auth:getUser": () => User | null;
  // Background->UI messages
  "auth:stateChanged": (user: User | null) => void;
  // Background->Offscreen messages
  "auth:chromeOffscreen": () => Promise<any>;
}

export const messaging = defineExtensionMessaging<MessagingProtocol>();
