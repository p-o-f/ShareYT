import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();

export const createEmailHash = functions.auth.user().onCreate(async (user) => {
  if (!user.email || !user.uid) return;

  const hash = crypto
    .createHash('sha256')
    .update(user.email.toLowerCase())
    .digest('hex');

  await admin.firestore().collection('emailHashes').doc(hash).set({
    uid: user.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

export const acceptFriendRequest = functions.https.onCall(
  async (data, context) => {
    const { requestId } = data;
    const uidMe = context.auth?.uid;
    if (!uidMe) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const reqRef = admin
      .firestore()
      .collection('friendRequests')
      .doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Request not found');
    }

    const { from, to } = reqSnap.data() || {};
    if (to !== uidMe) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Not your request',
      );
    }

    const friendshipId = [from, to].sort().join('_');

    await admin.firestore().runTransaction(async (t) => {
      t.delete(reqRef);
      t.set(admin.firestore().collection('friendships').doc(friendshipId), {
        users: [from, to],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },
);
