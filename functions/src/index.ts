import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();
const db = admin.firestore();

/*COMMAND TO DEPLOY TO FIRESTORE:

firebase deploy --only functions

*/

export const searchUsersByEmail = functions.https.onCall(
  async (data, context) => {
    const { email } = data;
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    if (!email || typeof email !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid email');
    }

    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
      };
    } catch {
      // Return null if not found, rather than throwing, to let the client handle it gracefully
      return null;
    }
  },
);

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

    // OLD CODE REPLACED BY BELOW BLOCK ---------------------------------------------------------------------------------
    // try {
    //   await db.runTransaction(async (t) => {
    //     const toDoc = await t.get(toRef);

    //     // Check if a request already exists in the other direction
    //     if (toDoc.exists && toDoc.data()?.sent?.[fromUid]) {
    //       throw new functions.https.HttpsError(
    //         'already-exists',
    //         'A friend request from this user is already pending.',
    //       );
    //     }

    //     // Atomically update both users' request documents
    //     t.set(fromRef, { sent: { [toUid]: timestamp } }, { merge: true });
    //     t.set(toRef, { received: { [fromUid]: timestamp } }, { merge: true });
    //   });

    //   return { success: true };
    // } catch (error) {
    //   console.error('Error sending friend request:', error);
    //   throw error; // Re-throw original HttpsError or a generic one
    // }
    // OLD CODE---------------------------------------------------------------------------------

    // Read first (outside transaction)
    const toDoc = await toRef.get();

    // Check if a request already exists in the other direction
    if (toDoc.exists && toDoc.data()?.sent?.[fromUid]) {
      throw new functions.https.HttpsError(
        'already-exists',
        'A friend request from this user is already pending.'
      );
    }

    // Atomically update both users' request documents
    try {
      await db.runTransaction(async (t) => {
        t.set(fromRef, { sent: { [toUid]: timestamp } }, { merge: true });
        t.set(toRef, { received: { [fromUid]: timestamp } }, { merge: true });
      });
    } catch (err) {
      console.error('Firestore transaction failed:', err);
      throw new functions.https.HttpsError(
        'internal',
        'Could not send friend request. Please try again.'
      );
    }

    return { success: true };

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

  // CASCADE DELETION: Delete all videos shared between these two users
  try {
    const videosRef = db.collection('suggestedVideos');

    // Query 1: Videos sent by Me to Friend
    const sentByMe = await videosRef
      .where('from', '==', uidMe)
      .where('to', '==', friendUid)
      .get();

    // Query 2: Videos sent by Friend to Me
    const sentByFriend = await videosRef
      .where('from', '==', friendUid)
      .where('to', '==', uidMe)
      .get();

    const batch = db.batch();
    let deleteCount = 0;

    sentByMe.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    sentByFriend.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(
        `Deleted ${deleteCount} shared videos between ${uidMe} and ${friendUid}.`,
      );
    }
  } catch (err) {
    console.error('Error performing cascade deletion of videos:', err);
    // We don't throw here because the main action (removing friend) succeeded.
  }

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
      reaction: data.reaction || null, // Optional reaction field (string)
    });
  }

  await batch.commit();

  return { success: true };
});

export const deleteVideo = functions.https.onCall(async (data, context) => {
  const uidMe = context.auth?.uid;
  const { suggestionId } = data;

  // 1. Authentication and validation
  if (!uidMe) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required.');
  }
  if (!suggestionId || typeof suggestionId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing or invalid suggestionId.',
    );
  }

  const suggestionRef = db.collection('suggestedVideos').doc(suggestionId);

  try {
    const suggestionDoc = await suggestionRef.get();

    if (!suggestionDoc.exists) {
      // The suggestion might have already been deleted by the other user.
      // This is not an error, so we can return success.
      console.log(
        `Suggestion ${suggestionId} not found. It may have already been deleted.`,
      );
      return { success: true, message: 'Suggestion already deleted.' };
    }

    const { from, to } = suggestionDoc.data() as { from: string; to: string };

    // 2. Authorization check: only sender or receiver can delete.
    if (uidMe !== from && uidMe !== to) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You do not have permission to delete this suggestion.',
      );
    }

    // 3. Delete the document
    await suggestionRef.delete();

    return { success: true };
  } catch (error) {
    console.error('Error deleting video suggestion:', error);
    // Re-throw HttpsError or wrap other errors
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      'internal',
      'An unexpected error occurred while deleting the video suggestion.',
    );
  }
});

export const updateReaction = functions.https.onCall(async (data, context) => {
  const uidMe = context.auth?.uid;
  const { suggestionId, reaction } = data;

  if (!uidMe) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required.');
  }

  if (!suggestionId || typeof suggestionId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing or invalid suggestionId.',
    );
  }

  if (reaction && typeof reaction !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Reaction must be a string.',
    );
  }

  if (reaction && reaction.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Reaction exceeds 100 characters.',
    );
  }

  const suggestionRef = db.collection('suggestedVideos').doc(suggestionId);

  try {
    const suggestionDoc = await suggestionRef.get();

    if (!suggestionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Suggestion not found');
    }

    const docData = suggestionDoc.data();
    if (docData?.from !== uidMe) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only the sender can edit the reaction.',
      );
    }

    await suggestionRef.update({ reaction: reaction || null });

    return { success: true };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error updating reaction:', error);
    throw new functions.https.HttpsError('internal', 'Update failed');
  }
});

// Deprecrated in favor of batchGetUserProfiles
export const getUserProfile = functions.https.onCall(async (data, context) => {
  const { uid } = data;
  const uidMe = context.auth?.uid;

  if (!uidMe) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing uid');
  }

  // Security Check: Ensure the requester is connected to the target user
  if (uid !== uidMe) {
    const [myFriendshipDoc, myRequestsDoc] = await Promise.all([
      db.collection('friendships').doc(uidMe).get(),
      db.collection('friendRequests').doc(uidMe).get(),
    ]);

    const isFriend = myFriendshipDoc.data()?.friends?.[uid];
    const isReceived = myRequestsDoc.data()?.received?.[uid];
    const isSent = myRequestsDoc.data()?.sent?.[uid];

    if (!isFriend && !isReceived && !isSent) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not authorized to view this user profile.',
      );
    }
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

export const batchGetUserProfiles = functions.https.onCall(
  async (data, context) => {
    // Require auth
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const raw = data?.uids;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'uids must be a non-empty array',
      );
    }

    // Sanitize and de-duplicate
    const uids = raw
      .filter((u: unknown): u is string => typeof u === 'string')
      .map((u) => u.trim())
      .filter(Boolean);

    if (uids.length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'No valid UIDs provided',
      );
    }

    const unique = Array.from(new Set(uids));
    if (unique.length > 100) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Max 100 UIDs per request',
      );
    }

    // Security Check: Filter out UIDs that are not friends or pending requests
    const uidMe = context.auth.uid;
    const [myFriendshipDoc, myRequestsDoc] = await Promise.all([
      db.collection('friendships').doc(uidMe).get(),
      db.collection('friendRequests').doc(uidMe).get(),
    ]);

    const friends = myFriendshipDoc.data()?.friends || {};
    const received = myRequestsDoc.data()?.received || {};
    const sent = myRequestsDoc.data()?.sent || {};

    const authorizedUids = unique.filter(
      (uid) => uid === uidMe || friends[uid] || received[uid] || sent[uid],
    );

    if (authorizedUids.length === 0) {
      return { users: [], notFound: unique };
    }

    // Build identifiers for getUsers
    const identifiers = authorizedUids.map((uid) => ({ uid }));

    const result = await admin.auth().getUsers(identifiers);

    // Map found users by uid
    const foundMap = new Map(
      result.users.map((u) => [
        u.uid,
        {
          displayName: u.displayName ?? null,
          email: u.email ?? null,
          photoURL: u.photoURL ?? null,
        },
      ]),
    );

    // Return results aligned with the original order
    const users = uids.map((uid) => {
      const profile = foundMap.get(uid);
      return {
        uid,
        displayName: profile?.displayName ?? null,
        email: profile?.email ?? null,
        photoURL: profile?.photoURL ?? null,
      };
    });

    // Also include which unique UIDs were not found
    const notFound = unique.filter((uid) => !foundMap.has(uid));

    return { users, notFound };
  },
);
