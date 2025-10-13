import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

/*COMMAND TO DEPLOY TO FIRESTORE:

firebase deploy --only functions

*/

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

    if (!from || from === to) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid request data',
      );
    }

    const friendshipId = [from, to].sort().join('_');
    const friendshipRef = admin
      .firestore()
      .collection('friendships')
      .doc(friendshipId);

    const friendshipSnap = await friendshipRef.get();
    if (friendshipSnap.exists) {
      // Already friends, just clean up the request
      await reqRef.delete();
      // Return the existing friendship info
      return { friendshipId, friendOne: from, friendTwo: to };
    }

    await admin.firestore().runTransaction(async (t) => {
      // Create friendship + delete request atomically
      t.delete(reqRef);
      t.set(friendshipRef, {
        friendOne: from,
        friendTwo: to,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { friendshipId, friendOne: from, friendTwo: to };
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

export const getUserProfile = functions.https.onCall(async (data) => {
  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid');
  }

  try {
    const userRecord = await admin.auth().getUser(uid);
    return {
      displayName: userRecord.displayName,
      email: userRecord.email,
      photoURL: userRecord.photoURL,
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw new functions.https.HttpsError('not-found', 'User not found');
  }
});
