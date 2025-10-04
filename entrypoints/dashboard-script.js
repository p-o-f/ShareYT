import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  getDoc,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, hashEmail, functions } from '../utils/firebase';
import { httpsCallable } from 'firebase/functions';

const acceptFriendRequest = httpsCallable(functions, 'acceptFriendRequest');
const getUserProfile = httpsCallable(functions, 'getUserProfile');

export default defineUnlistedScript(async () => {
  console.log(
    'Unlisted script running in this manifest version',
    browser.runtime.getManifest().manifest_version,
  );
  async function loadDashboardData() {
    const user = await storage.getItem('local:user');
    if (!user) {
      // Edge case where user enters direct URL (like chrome-extension://okgeoiihamcnmicnhaojpflilhfhghjp/dashboard.html) without being logged in: show alternate screen
      // TODO handle the edge case where the user logs out while still on the dashboard page (then user becomes null)
      document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
        <h2>Please log in to ShareYT first to view your dashboard.</h2>
      </div>
    `;
      return;
    }
    const userEmail = user.email;
    const userId = user.uid;

    // inside loadDashboardData, after fetching user, set user info in DOM of dashboard
    document.getElementById('profile-username').textContent =
      user.displayName || user.name || user.email || '';
    document.getElementById('greeting-username').textContent =
      user.displayName || user.name || user.email || '';
    document.getElementById('profile-picture').src =
      user.photoURL || 'https://www.gravatar.com/avatar?d=mp';

    // ---------------------------
    // RENDER FRIEND REQUEST CARD
    // ---------------------------
    function renderFriendRequestCard(requestDocId, requestData) {
      const html = `
        <div class="video-card" style="width: 280px;">
          <div class="video-info">
            <strong>${requestData.email}</strong><br />
            <small>wants to be friends</small><br />
            <button class="accept-btn" style="margin-top: 0.5rem; background:#4caf50; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Accept</button>
            <button class="reject-btn" style="margin-top: 0.5rem; margin-left:5px; background:#f44336; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Reject</button>
          </div>
        </div>
      `;

      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const card = temp.firstChild;

      // Accept button → add to friends collection + remove request
      card.querySelector('.accept-btn').addEventListener('click', async () => {
        try {
          // Call Cloud Function
          const result = await acceptFriendRequest({ requestId: requestDocId });
          const { friendshipId, friendOne, friendTwo } = result.data;

          console.log(
            'Friendship created:',
            friendshipId,
            friendOne,
            friendTwo,
          );

          // Determine the UID of the new friend
          const friendId = friendOne === userId ? friendTwo : friendOne;

          // Only add if not already present
          if (!friends[friendId]) {
            const profile = await getUserProfile({ uid: friendId });
            friends[friendId] = profile.data;
            render(); // update friends list immediately
          }

          // Remove the card immediately from UI for seamlessness
          card.remove();
        } catch (err) {
          console.error('Failed to accept friend request:', err);
          alert('Something went wrong accepting this request.');
        }
      });

      // Reject button → just delete request
      card.querySelector('.reject-btn').addEventListener('click', async () => {
        try {
          await deleteDoc(doc(db, 'friendRequests', requestDocId));
          card.remove(); // remove the card immediately
        } catch (err) {
          console.error('Failed to reject friend request:', err);
          alert('Something went wrong rejecting this request.');
        }
      });

      return card;
    }

    // ---------------------------
    // RENDER FRIEND TILE
    // ---------------------------
    function renderFriendTile(friendData) {
      //console.log('Calling renderFriendTile with friend tile for:', friendData);
      const html = `
        <div class="friend-tile" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0;">
          <div style="display: flex; align-items: center;">
            <img src="${
              friendData.photoURL || 'https://www.gravatar.com/avatar?d=mp'
            }" alt="Profile Picture" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 12px;" />
            <span>${friendData.displayName || friendData.email}</span>
          </div>
          <button class="remove-friend-btn" style="background-color: #f44336; color: white; border: none; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; padding: 0; font-size: 14px;">X</button>
        </div>
      `;
      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const tile = temp.firstChild;

      tile
        .querySelector('.remove-friend-btn')
        .addEventListener('click', (e) => {
          e.stopPropagation();
          // For now, do nothing. In the future, this will remove the friend.
          console.log('Remove friend button clicked for:', friendData.email);
        });

      return tile;
    }

    // ---------------------------
    // WATCH FRIENDSHIPS
    // ---------------------------
    function watchFriendships(userId) {
      //console.log('Calling watchFriendships with userId:', userId);
      const friendsList = document.getElementById('friends-list');
      // Use an object to store friend data, keyed by UID, to prevent duplicates
      const friends = {};

      const render = () => {
        friendsList.innerHTML = '';
        Object.values(friends).forEach((friendData) => {
          if (friendData) {
            // Ensure friendData is not null/undefined
            friendsList.appendChild(renderFriendTile(friendData));
          }
        });
      };

      const handleSnapshot = (snapshot, getFriendId) => {
        const changes = snapshot.docChanges();
        let needsRender = false;

        // Use a promise to wait for all profile lookups in this batch of changes
        const promises = changes.map(async (change) => {
          const docData = change.doc.data();
          const friendId = getFriendId(docData);

          if (change.type === 'removed') {
            delete friends[friendId];
            needsRender = true;
          } else {
            // 'added' or 'modified'
            try {
              // Only fetch profile if we don't already have it
              if (!friends[friendId]) {
                const result = await getUserProfile({ uid: friendId });
                friends[friendId] = result.data;
                needsRender = true;
              }
            } catch (e) {
              console.error(`Failed to get profile for ${friendId}`, e);
            }
          }
        });

        // After all changes in this snapshot are processed, render if needed
        Promise.all(promises).then(() => {
          if (needsRender) {
            render();
          }
        });
      };

      const q1 = query(
        collection(db, 'friendships'),
        where('friendOne', '==', userId),
      );
      const unsub1 = onSnapshot(q1, (snap) =>
        handleSnapshot(snap, (data) => data.friendTwo),
      );

      const q2 = query(
        collection(db, 'friendships'),
        where('friendTwo', '==', userId),
      );
      const unsub2 = onSnapshot(q2, (snap) =>
        handleSnapshot(snap, (data) => data.friendOne),
      );

      return () => {
        unsub1();
        unsub2();
      };
    }

    // ---------------------------
    // WATCH FRIEND REQUESTS
    // ---------------------------
    function watchFriendRequests() {
      const reqRef = collection(db, 'friendRequests');
      const q = query(reqRef, where('to', '==', userId));

      const reqGrid = document.querySelector('.friend-requests-grid');

      // Keep a map of current cards so we can apply only the incremental changes
      const requestCards = new Map();

      onSnapshot(q, (snapshot) => {
        // Use docChanges to process only the changes and avoid rebuilding the whole grid
        const addedFrag = document.createDocumentFragment();

        snapshot.docChanges().forEach((change) => {
          const id = change.doc.id;
          const data = change.doc.data();

          if (change.type === 'removed') {
            const existing = requestCards.get(id);
            if (existing) {
              existing.remove();
              requestCards.delete(id);
            }
            return;
          }

          if (change.type === 'added') {
            const card = renderFriendRequestCard(id, data);
            requestCards.set(id, card);
            addedFrag.appendChild(card);
            return;
          }

          if (change.type === 'modified') {
            // Replace the existing card with a newly rendered card for simplicity
            const existing = requestCards.get(id);
            const newCard = renderFriendRequestCard(id, data);
            requestCards.set(id, newCard);
            if (existing && existing.parentNode) {
              existing.parentNode.replaceChild(newCard, existing);
            } else {
              addedFrag.appendChild(newCard);
            }
          }
        });

        if (addedFrag.childNodes.length) reqGrid.appendChild(addedFrag);
      });
    }

    // ---------------------------
    // VIDEO WATCHERS
    // ---------------------------
    function renderVideoCard(data, role) {
      const label =
        role === 'receiver'
          ? `Shared by ${data.suggestedBy || 'Unknown'}`
          : `Sent to ${data.sentTo || 'Unknown'}`;

      // const dateObj = data.suggestedTime?.toDate
      //   ? data.createdAt.toDate()
      //   : null;
      const dateObj = data.suggestedTime?.toDate?.() ?? null;

      const formattedDate = dateObj
        ? dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Unknown date';

      const html = `
<div class="video-card" style="display: block;">
  <div class="video-thumbnail" style="width: 100%;">
    <img src="${data.thumbnailUrl}" alt="Video Thumbnail" style="width: 100%; height: auto; display: block;" />
  </div>
  <div class="video-info" style="margin-top: 8px;">
    <strong>${data.title || 'Untitled Video'}</strong><br />
    <small>${label} · ${formattedDate}</small><br />
    <input type="checkbox" ${data.watched ? 'checked' : ''}/> Mark as Watched
    <span class="watch-btn" style="float: right; color: #3b4cca; cursor: pointer;">Watch</span>
  </div>
</div>
      `;

      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const card = temp.firstChild;

      card.querySelector('.watch-btn').addEventListener('click', () => {
        window.open(
          `https://www.youtube.com/watch?v=${data.videoId}`,
          '_blank',
        );
      });

      return card;
    }

    function watchCollection(role) {
      const videoGrid = document.querySelector(
        `.video-grid[share-type="${role}"]`,
      );

      if (!videoGrid) return;

      const field = role === 'sender' ? 'from' : 'to';
      const q = query(
        collection(db, 'suggestedVideos'),
        where(field, '==', userId),
      );

      // Subscribe to real-time updates
      onSnapshot(q, (snapshot) => {
        videoGrid.innerHTML = '';
        snapshot.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() };
          videoGrid.appendChild(renderVideoCard(data, role));
        });
      });
    }

    // // Watch inbox/outbox
    watchCollection('receiver');
    watchCollection('sender');

    // Watch friend requests
    watchFriendRequests();

    // Watch friendships
    watchFriendships(userId);

    // ---------------------------
    // SEND FRIEND REQUEST
    // ---------------------------
    const emailInput = document.getElementById('friend-email-input');
    const sendBtn = document.getElementById('send-friend-request');

    async function sendFriendRequest() {
      const targetEmail = emailInput.value.trim().toLowerCase();
      console.log('EMAILS', targetEmail);
      if (!targetEmail || !targetEmail.includes('@gmail.com'))
        return alert('Please enter a valid Gmail email.');
      if (targetEmail === userEmail.toLowerCase())
        return alert("You can't send a request to yourself!");

      const uidRef = doc(db, 'emailHashes', hashEmail(targetEmail));
      const otherUserIdDoc = await getDoc(uidRef);
      const uidOther = otherUserIdDoc.exists()
        ? otherUserIdDoc.data().uid
        : null;

      if (uidOther === null) {
        return alert(
          'The email you entered does not have a ShareYT uid, please tell them to register with ShareYT first!',
        );
      }

      // Check if a request has already been sent in either direction
      const q1 = query(
        collection(db, 'friendRequests'),
        where('from', '==', userId),
        where('to', '==', uidOther),
      );

      const q2 = query(
        collection(db, 'friendRequests'),
        where('from', '==', uidOther),
        where('to', '==', userId),
      );

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

      if (!snapshot1.empty || !snapshot2.empty) {
        return alert(
          `A friend request already exists between you and ${targetEmail}!`,
        );
      }

      // Check if that friend has already been added and is now part of the friends list
      const friendshipId = [userId, uidOther].sort().join('_');
      const friendshipRef = doc(db, 'friendships', friendshipId);
      const friendshipDoc = await getDoc(friendshipRef);

      if (friendshipDoc.exists()) {
        return alert(`${targetEmail} is already your friend!`);
      }

      // Send the friend request
      await addDoc(collection(db, 'friendRequests'), {
        from: userId,
        to: uidOther,
        email: userEmail,
        createdAt: serverTimestamp(),
      });

      let success = `A friend request was sent to ${targetEmail}`;
      console.log(success);
      emailInput.value = '';
      return alert(success);
    }

    sendBtn?.addEventListener('click', sendFriendRequest);
    emailInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendFriendRequest();
    });
  }

  await loadDashboardData();
});
