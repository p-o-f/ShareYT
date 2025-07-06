import { User } from 'firebase/auth';

export type SerializedUser = Pick<
  User,
  'uid' | 'email' | 'displayName' | 'photoURL'
>;
