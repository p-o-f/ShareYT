import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

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

exports.suggestVideo = functions.https.onCall(async (data, context) => {
  // Make sure the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to suggest a video.',
    );
  }

  const { videoId, to, thumbnailUrl, title } = data;

  // Check required fields
  if (!videoId || !to || !thumbnailUrl || !title) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing fields.');
  }

  let toUid;
  try {
    toUid = (await admin.auth().getUserByEmail(to)).uid;
  } catch {
    throw new functions.https.HttpsError(
      'not-found',
      'User with this email not found.',
    );
  }

  try {
    // Check if friend request exists
    const friendRequestsSnapshot = await db
      .collection('friendRequests')
      .where('from', '==', context.auth.uid)
      .where('to', '==', toUid)
      .limit(1)
      .get();

    if (friendRequestsSnapshot.empty) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No friend request exists between these users.',
      );
    }

    // Check for duplicate suggestions -- TODO verify functionality
    const existingSuggestionSnapshot = await db
      .collection('suggestedVideos')
      .where('videoId', '==', videoId)
      .where('from', '==', context.auth.uid)
      .where('to', '==', toUid)
      .limit(1)
      .get();

    if (!existingSuggestionSnapshot.empty) {
      throw new functions.https.HttpsError(
        'already-exists',
        'This video has already been suggested to this user.',
      );
    }

    // Add video suggestion
    const suggestionRef = await db.collection('suggestedVideos').add({
      videoId,
      from: context.auth.uid,
      to: toUid,
      thumbnailUrl,
      title,
      watched: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, id: suggestionRef.id };
  } catch (error) {
    console.error('Error suggesting video:', error);
    throw new functions.https.HttpsError(
      'unknown',
      'An error occurred while suggesting the video.',
    );
  }
});
