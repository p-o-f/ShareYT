import { onSnapshot, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, hashEmail, functions } from '../utils/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  listenToFriendships,
  listenToFriendRequests,
  listenToSuggestedVideos,
} from '../utils/listeners';

// Cloud Functions - all have suffix "Fn" to avoid naming confusion
const acceptFriendRequestFn = httpsCallable(functions, 'acceptFriendRequest');
const rejectFriendRequestFn = httpsCallable(functions, 'rejectFriendRequest');
const removeFriendFn = httpsCallable(functions, 'removeFriend');
const sendFriendRequestFn = httpsCallable(functions, 'sendFriendRequest');
const getUserProfileFn = httpsCallable(functions, 'getUserProfile');

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
    function renderFriendRequestCard(senderUid, senderEmail) {
      const html = `
        <div class="video-card" style="width: 280px;">
          <div class="video-info">
            <strong>${senderEmail || senderUid}</strong><br />
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
          // Call Cloud Function with the sender's UID
          await acceptFriendRequestFn({ requestId: senderUid });
          console.log('Friend request accepted from:', senderUid);

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
          await rejectFriendRequestFn({ fromUid: senderUid });
          card.remove(); // remove the card from the UI
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
    function renderFriendTile(friendUid, friendData) {
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
        .addEventListener('click', async (e) => {
          e.stopPropagation();
          if (
            confirm(
              `Are you sure you want to remove ${friendData.displayName || friendData.email} as a friend?`,
            )
          ) {
            try {
              await removeFriendFn({ friendUid });
            } catch (err) {
              console.error('Error removing friend:', err);
              alert('Failed to remove friend.');
            }
          }
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
      let unsub;

      const render = () => {
        friendsList.innerHTML = '';
        Object.entries(friends).forEach(([uid, friendData]) => {
          if (friendData) {
            friendsList.appendChild(renderFriendTile(uid, friendData));
          }
        });
      };

      const handleSnapshot = async (snapshot) => {
        const friendMap = snapshot.data()?.friends || {};
        const currentFriendIds = Object.keys(friends);
        const newFriendIds = Object.keys(friendMap);

        // Find new friends to add
        const friendIdsToAdd = newFriendIds.filter(
          (id) => !currentFriendIds.includes(id),
        );
        // Find removed friends
        const friendIdsToRemove = currentFriendIds.filter(
          (id) => !newFriendIds.includes(id),
        );

        friendIdsToRemove.forEach((id) => delete friends[id]);

        const profilesToFetch = friendIdsToAdd.map((uid) =>
          getUserProfileFn({ uid }),
        );

        try {
          const profiles = await Promise.all(profilesToFetch);
          profiles.forEach((result, index) => {
            const uid = friendIdsToAdd[index];
            friends[uid] = result.data;
          });

          if (friendIdsToAdd.length > 0 || friendIdsToRemove.length > 0) {
            render();
          }
        } catch (e) {
          console.error('Error fetching friend profiles:', e);
        }
      };

      if (unsub) unsub(); // Unsubscribe from previous listener if any
      unsub = listenToFriendships(userId, handleSnapshot);

      return () => {
        if (unsub) unsub();
      };
    }

    // ---------------------------
    // WATCH FRIEND REQUESTS
    // ---------------------------
    function watchFriendRequests() {
      const reqGrid = document.querySelector('.friend-requests-grid');
      const requestCards = new Map();

      listenToFriendRequests(userId, async (snapshot) => {
        const receivedRequests = snapshot.data()?.received || {};
        const currentRequestUids = Array.from(requestCards.keys());
        const newRequestUids = Object.keys(receivedRequests);

        // Remove cards for requests that are no longer present
        currentRequestUids.forEach((uid) => {
          if (!newRequestUids.includes(uid)) {
            requestCards.get(uid)?.remove();
            requestCards.delete(uid);
          }
        });

        // Add cards for new requests
        for (const uid of newRequestUids) {
          if (!requestCards.has(uid)) {
            // We need the sender's email. This is a downside of the new schema.
            // For now, we'll just show the UID. A better solution would be to
            // include the sender's email in the friendRequests document.
            const profile = await getUserProfileFn({ uid });
            const card = renderFriendRequestCard(uid, profile.data.email);
            requestCards.set(uid, card);
            reqGrid.appendChild(card);
          }
        }
      });
    }

    // ---------------------------
    // VIDEO WATCHERS
    // ---------------------------
    function renderVideoCard(data, role) {
      console.log('Rendering video card for:', data);
      const label =
        role === 'receiver'
          ? `Shared by ${data.from || 'Unknown'}` // TODO fix this, currently just showing UIDs
          : `Sent to ${data.to || 'Unknown'}`;

      const dateObj = data.timestamp?.toDate?.() ?? null;

      const formattedDate = dateObj
        ? dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
          })
        : 'Unknown date';

      const html = `
<div class="video-card" style="display: block;">
  <div class="video-thumbnail" style="width: 100%;">
    <img src="${data.thumbnailUrl}" alt="Video Thumbnail" style="width: 100%; height: auto; display: block;" />
  </div>
  <div class="video-info" style="margin-top: 8px;">
    <strong>${data.title || 'Untitled Video'}</strong><br />
    <small>${label} at ${formattedDate}</small><br />
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

      // Subscribe to real-time updates
      listenToSuggestedVideos(userId, role, (snapshot) => {
        videoGrid.innerHTML = '';
        snapshot.forEach((doc) => {
          const data = { id: doc.id, ...doc.data() };
          videoGrid.appendChild(renderVideoCard(data, role));
        });
      });
    }

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

      try {
        const emailHash = hashEmail(targetEmail);
        const uidRef = doc(db, 'emailHashes', emailHash);
        const otherUserDoc = await getDoc(uidRef);

        if (!otherUserDoc.exists()) {
          return alert('User with that email does not exist.');
        }
        const toUid = otherUserDoc.data().uid;

        // Check if already friends
        const friendshipDoc = await getDoc(doc(db, 'friendships', userId));
        if (friendshipDoc.exists() && friendshipDoc.data().friends?.[toUid]) {
          return alert('You are already friends with this user.');
        }

        await sendFriendRequestFn({ toUid });

        let success = `A friend request was sent to ${targetEmail}`;
        console.log(success);
        emailInput.value = '';
        return alert(success);
      } catch (e) {
        console.error('Error sending friend request:', e);
        alert(`Failed to send friend request: ${e.message}`);
      }
    }

    sendBtn?.addEventListener('click', sendFriendRequest);
    emailInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendFriendRequest();
    });
  }

  await loadDashboardData();
});
