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
import { hashEmail, functions } from '../utils/firebase';
import { httpsCallable } from 'firebase/functions';

const acceptFriendRequest = httpsCallable(functions, 'acceptFriendRequest');

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
        acceptFriendRequest({ requestId: requestDocId });
      });

      // Reject button → just delete request
      card.querySelector('.reject-btn').addEventListener('click', async () => {
        await deleteDoc(doc(db, 'friendRequests', requestDocId));
      });

      return card;
    }

    // ---------------------------
    // WATCH FRIEND REQUESTS
    // ---------------------------
    function watchFriendRequests() {
      const reqRef = collection(db, 'friendRequests');
      const q = query(reqRef, where('to', '==', userId));

      const reqGrid = document.querySelector('.friend-requests-grid');

      onSnapshot(q, (snapshot) => {
        // TODO: possibly diff it to make it faster
        reqGrid.innerHTML = ''; // Clear old requests
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          reqGrid.appendChild(renderFriendRequestCard(docSnap.id, data));
        });
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

      const dateObj = data.suggestedTime?.toDate
        ? data.createdAt.toDate()
        : null;

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

      // Check if a request has already been sent
      const q = query(
        collection(db, 'friendRequests'),
        where('to', '==', uidOther),
        where('from', '==', userId),
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        return alert(`You have already sent a request to ${targetEmail}!`);
      }

      // Check if that friend has already been added (TODO)

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
