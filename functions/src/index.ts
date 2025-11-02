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

export const sendFriendRequest = functions.https.onCall(
  async (data, context) => {
    const { toUid } = data;
    const fromUid = context.auth?.uid;

    if (!fromUid) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    if (!toUid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing recipient UID.',
      );
    }

    if (fromUid === toUid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        "You can't send a request to yourself.",
      );
    }

    const fromRef = db.collection('friendRequests').doc(fromUid);
    const toRef = db.collection('friendRequests').doc(toUid);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    try {
      await db.runTransaction(async (t) => {
        const toDoc = await t.get(toRef);

        // Check if a request already exists in the other direction
        if (toDoc.exists && toDoc.data()?.sent?.[fromUid]) {
          throw new functions.https.HttpsError(
            'already-exists',
            'A friend request from this user is already pending.',
          );
        }

        // Atomically update both users' request documents
        t.set(fromRef, { sent: { [toUid]: timestamp } }, { merge: true });
        t.set(toRef, { received: { [fromUid]: timestamp } }, { merge: true });
      });

      return { success: true };
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error; // Re-throw original HttpsError or a generic one
    }
  },
);

export const acceptFriendRequest = functions.https.onCall(
  async (data, context) => {
    const { requestId } = data;
    const uidMe = context.auth?.uid;
    if (!uidMe) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const fromUid = requestId; // In the new schema, the request ID is the sender's UID.

    if (!fromUid || fromUid === uidMe) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid request data',
      );
    }

    const myRequestsRef = db.collection('friendRequests').doc(uidMe);
    const theirRequestsRef = db.collection('friendRequests').doc(fromUid);

    const myFriendshipRef = db.collection('friendships').doc(uidMe);
    const theirFriendshipRef = db.collection('friendships').doc(fromUid);

    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    await admin.firestore().runTransaction(async (t) => {
      const myReqDoc = await t.get(myRequestsRef);
      if (!myReqDoc.exists || !myReqDoc.data()?.received?.[fromUid]) {
        throw new functions.https.HttpsError('not-found', 'Request not found.');
      }

      // 1. Remove the friend request from both sides
      t.update(myRequestsRef, {
        [`received.${fromUid}`]: admin.firestore.FieldValue.delete(),
      });
      t.update(theirRequestsRef, {
        [`sent.${uidMe}`]: admin.firestore.FieldValue.delete(),
      });

      // 2. Add friendship to both sides
      t.set(
        myFriendshipRef,
        { friends: { [fromUid]: timestamp } },
        { merge: true },
      );
      t.set(
        theirFriendshipRef,
        { friends: { [uidMe]: timestamp } },
        { merge: true },
      );
    });

    return { success: true, friendId: fromUid };
  },
);

export const rejectFriendRequest = functions.https.onCall(
  async (data, context) => {
    const { fromUid } = data;
    const uidMe = context.auth?.uid;

    if (!uidMe) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    if (!fromUid || fromUid === uidMe) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid request data. Missing sender UID.',
      );
    }

    const myRequestsRef = db.collection('friendRequests').doc(uidMe);
    const theirRequestsRef = db.collection('friendRequests').doc(fromUid);

    await db.runTransaction(async (t) => {
      // We read the doc first to ensure the request exists before proceeding.
      const myReqDoc = await t.get(myRequestsRef);
      if (!myReqDoc.exists || !myReqDoc.data()?.received?.[fromUid]) {
        // This is not a critical error. The request might have been cancelled.
        // We can just log it and let the function succeed.
        console.log(`Request from ${fromUid} to ${uidMe} not found.`);
        return;
      }

      // Atomically remove the request from both sides.
      t.update(myRequestsRef, {
        [`received.${fromUid}`]: admin.firestore.FieldValue.delete(),
      });
      t.update(theirRequestsRef, {
        [`sent.${uidMe}`]: admin.firestore.FieldValue.delete(),
      });
    });

    return { success: true };
  },
);

export const removeFriend = functions.https.onCall(async (data, context) => {
  const { friendUid } = data;
  const uidMe = context.auth?.uid;

  if (!uidMe) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  if (!friendUid || friendUid === uidMe) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid request data. Missing friend UID.',
    );
  }

  const myFriendshipRef = db.collection('friendships').doc(uidMe);
  const theirFriendshipRef = db.collection('friendships').doc(friendUid);

  await db.runTransaction(async (t) => {
    // We read the doc first to ensure the friendship exists before proceeding.
    const myFriendshipDoc = await t.get(myFriendshipRef);
    if (
      !myFriendshipDoc.exists ||
      !myFriendshipDoc.data()?.friends?.[friendUid]
    ) {
      // This is not a critical error. The friend might have already been removed.
      console.log(`Friendship between ${uidMe} and ${friendUid} not found.`);
      return;
    }

    // Atomically remove the friendship from both sides.
    t.update(myFriendshipRef, {
      [`friends.${friendUid}`]: admin.firestore.FieldValue.delete(),
    });
    t.update(theirFriendshipRef, {
      [`friends.${uidMe}`]: admin.firestore.FieldValue.delete(),
    });
  });

  return { success: true };
});

export const suggestVideo = functions.https.onCall(async (data, context) => {
  // Make sure the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be signed in to suggest a video.',
    );
  }

  const { videoId, toUids, thumbnailUrl, title } = data; // `toUids` is an array of recipient UIDs
  const fromUid = context.auth.uid;

  // Check required fields
  if (
    !videoId ||
    !toUids ||
    !Array.isArray(toUids) ||
    toUids.length === 0 ||
    !thumbnailUrl ||
    !title
  ) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required fields.',
    );
  }

  const batch = db.batch();

  // We should verify friendship for all recipients
  const friendshipDoc = await db.collection('friendships').doc(fromUid).get();
  const friendsMap = friendshipDoc.data()?.friends || {};

  for (const toUid of toUids) {
    if (fromUid === toUid) continue; // Can't send to self

    // Verify friendship
    if (!friendsMap[toUid]) {
      console.warn(
        `User ${fromUid} tried to send video to non-friend ${toUid}. Skipping.`,
      );
      continue;
    }

    // Create a composite ID to prevent duplicates.
    // If the suggestion already exists, this will just overwrite it.
    const compositeId = `${fromUid}_${toUid}_${videoId}`;
    const newSuggestionRef = db.collection('suggestedVideos').doc(compositeId);

    batch.set(newSuggestionRef, {
      videoId,
      from: fromUid,
      to: toUid,
      thumbnailUrl,
      title,
      watched: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  return { success: true };
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
