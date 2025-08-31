import { User } from 'firebase/auth';

export type SerializedUser = Pick<
  User,
  'uid' | 'email' | 'displayName' | 'photoURL'
>;
export type VideoReccomendation = {
  videoId: string | null;
  to: string | null;
  thumbnailUrl: string | null;
  title: string | null;
};
