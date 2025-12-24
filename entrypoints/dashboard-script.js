import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../utils/firebase';
import { httpsCallable } from 'firebase/functions';

// Cloud Functions - all have suffix "Fn" to avoid naming confusion
const acceptFriendRequestFn = httpsCallable(functions, 'acceptFriendRequest');
const rejectFriendRequestFn = httpsCallable(functions, 'rejectFriendRequest');
const removeFriendFn = httpsCallable(functions, 'removeFriend');
const sendFriendRequestFn = httpsCallable(functions, 'sendFriendRequest');
const getUserProfileFn = httpsCallable(functions, 'getUserProfile');
const deleteVideoFn = httpsCallable(functions, 'deleteVideo');

// // For manual testing in console, temporary
// window.getUserProfileFn = getUserProfileFn;

export default defineUnlistedScript(async () => {
  console.log(
    'Dashboard script running in this manifest version',
    browser.runtime.getManifest().manifest_version,
  );
  async function loadDashboardData() {
    const user = await storage.getItem('local:user');
    if (!user) {
      // Edge case where user enters direct URL (like chrome-extension://okgeoiihamcnmicnhaojpflilhfhghjp/dashboard.html) without being logged in: show alternate screen
      document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
        <h2>Please log in to ShareYT first to view your dashboard. If you are logged in, please refresh the page.</h2>
      </div>
    `;
      return;
    }

    //  Edge case where the user logs out while they're still on the dashboard page (then user becomes null)
    storage.watch('local:user', (user) => {
      if (!user) {
        location.reload(); // show dashboard to user again
        return;
      }
    });

    // storage.watch<SerializedUser>(
    //       'local:user',
    //       async (currentUser, previousUser) => {
    //         console.log('User loginStatus changed:', { currentUser, previousUser });

    //         if (!currentUser && previousUser) {
    //           // User was previously logged in, now they are logged out
    //           isLoggedIn = false;
    //           console.log('isLoggedin status after logout:' + isLoggedIn);
    //         } else {
    //           // User was previously logged out, now they are logged in
    //           isLoggedIn = true;
    //           console.log('isLoggedin status after login:' + isLoggedIn);
    //         }
    //       },
    //     );

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
              friendData.img ||
              friendData.photoURL ||
              'https://www.gravatar.com/avatar?d=mp'
            }" alt="Profile Picture" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 12px;" />
            <span>${friendData.label || friendData.displayName || friendData.email}</span>
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
              `Are you sure you want to remove ${friendData.label || friendData.displayName || friendData.email} as a friend?`,
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
    // STATE MANAGEMENT
    // ---------------------------
    let friendsState = [];
    let receiverVideosState = [];
    let senderVideosState = [];

    // Helper to get name from UID
    const getName = (uid) => {
      const friend = friendsState.find((f) => f.id === uid);
      return friend ? friend.label || friend.displayName || friend.email : uid;
    };

    // Helper to format list of UIDs
    const getNames = (uids) => {
      if (!Array.isArray(uids)) return getName(uids);
      return uids.map(getName).join(', ');
    };

    // ---------------------------
    // VIDEO WATCHERS
    // ---------------------------
    
    // helper functions
    const openVideo = (videoId) => {
        window.open(
          `https://www.youtube.com/watch?v=${videoId}`,
          '_blank',
        );

        //TODO Handle "mark as watched" logic here?
    }
    function renderVideoCard(data, role) {
      console.log('Rendering video card for:', data);

      let label = '';
      if (role === 'receiver') {
        label = `Shared by ${getName(data.from)}`;
      } else {
        // data.to might be a single UID or array?
        // Based on messaging.ts it sends an array.
        // But let's handle both just in case.
        label = `Sent to ${getNames(data.to)}`;
      }

      const dateObj =
        data.timestamp?.toDate?.() ??
        (data.timestamp ? new Date(data.timestamp.seconds * 1000) : null);

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
    <strong class="video-title">${data.title || 'Untitled Video'}</strong><br />
    <small>${label} at ${formattedDate}</small><br />
    <input class="time-checkbox" type="checkbox" ${data.watched ? 'checked' : ''}/> Mark as Watched
    <span class="watch-btn" style="float: right; color: #3b4cca; cursor: pointer;">Watch</span>
  </div>
</div>
      `;

      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const card = temp.firstChild;

      // click to video
      const thumbnail = card.querySelector('.video-thumbnail');
      if (thumbnail) thumbnail.addEventListener('click', 
        openVideo, data.videoId);

      // other 
      card.querySelector('.watch-btn').addEventListener('click', () => {
        openVideo(data.videoId);
      });

      card.querySelector('.time-checkbox').addEventListener('click', () => {
        //TODO implement
      });

      return card;
    }

    function renderGroupedSenderVideoCard(groupData) {
      // groupData: { videoId, title, thumbnailUrl, recipients: [{to, timestamp, docId}, ...] }
      if (!groupData.recipients || groupData.recipients.length === 0)
        return null;

      // Sort by timestamp asc (oldest shared first)
      groupData.recipients.sort((a, b) => a.timestamp - b.timestamp);

      const firstRecipient = getName(groupData.recipients[0].to);
      const otherCount = groupData.recipients.length - 1;

      let recipientsLabel = `Sent to ${firstRecipient}`;
      if (otherCount > 0) {
        recipientsLabel += ` + ${otherCount} other${otherCount > 1 ? 's' : ''}`;
      }

      // Format date of the LATEST share (or first? let's do first)
      const firstDateObj = new Date(groupData.recipients[0].timestamp * 1000);
      const formattedDate = firstDateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      });

      const html = `
<div class="video-card" style="display: block; position: relative;">
  <div class="video-thumbnail" style="width: 100%;">
    <img src="${groupData.thumbnailUrl}" alt="Video Thumbnail" style="width: 100%; height: auto; display: block;" />
  </div>
  <div class="video-info" style="margin-top: 8px;">
    <strong class="video-title">${groupData.title || 'Untitled Video'}</strong><br />
    
    <!-- Clickable Recipient Label -->
    <div class="recipients-trigger" style="cursor: pointer; color: #3b4cca; margin-bottom: 4px;">
       <small>${recipientsLabel} at ${formattedDate}</small> ▾
    </div>

    <!-- Dropdown (Hidden by default) -->
    <div class="recipients-dropdown" style="display: none; background: #f9f9f9; border: 1px solid #ddd; padding: 10px; margin-top: 5px; border-radius: 4px; font-size: 0.9em;">
        <div class="recipients-list" style="margin-bottom: 8px; max-height: 150px; overflow-y: auto;">
          <!-- Items injected here -->
        </div>
        <button class="save-updates-btn" style="width:100%; background:#4caf50; color:white; border:none; padding:5px; cursor:pointer; border-radius:3px;">Save Updates</button>
    </div>

    <span class="watch-btn" style="float: right; color: #3b4cca; cursor: pointer; margin-top: 5px;">Watch</span>
  </div>
</div>
      `;

      const temp = document.createElement('div');
      temp.innerHTML = html.trim();
      const card = temp.firstChild;

      // click to video
      const thumbnail = card.querySelector('.video-thumbnail');
      if (thumbnail) thumbnail.addEventListener('click', 
        openVideo, groupData.videoId);

      // Toggle Dropdown
      const trigger = card.querySelector('.recipients-trigger');
      const dropdown = card.querySelector('.recipients-dropdown');
      const listContainer = card.querySelector('.recipients-list');
      const saveBtn = card.querySelector('.save-updates-btn');

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = dropdown.style.display === 'none';

        // Lazy render list items only when opening
        if (isHidden) {
          listContainer.innerHTML = ''; // Request freshness
          groupData.recipients.forEach((r) => {
            const rName = getName(r.to);
            const rDate = new Date(r.timestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            const itemRow = document.createElement('div');
            itemRow.style.cssText =
              'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';

            // Checkbox is checked by default (representing "Currently Sent")
            // Unchecking means "Delete/Unsend"
            itemRow.innerHTML = `
               <span>${rName} <small style="color:#666">(${rDate})</small></span>
               <input type="checkbox" class="recipient-checkbox" checked data-doc-id="${r.docId}" />
             `;
            listContainer.appendChild(itemRow);
          });
        }

        dropdown.style.display = isHidden ? 'block' : 'none';
      });

      // SAVE Button Logic (Unsend)
      saveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        const checkboxes = listContainer.querySelectorAll(
          '.recipient-checkbox',
        );
        const toDelete = [];

        checkboxes.forEach((cb) => {
          if (!cb.checked) {
            toDelete.push(cb.getAttribute('data-doc-id'));
          }
        });

        if (toDelete.length === 0) {
          // Nothing to change
          dropdown.style.display = 'none';
          saveBtn.textContent = 'Save Updates';
          saveBtn.disabled = false;
          return;
        }

        try {
          // Process deletions
          // We can do parallel calls since we don't have a batchDelete cloud function exposing array input yet?
          // Or deleteVideoFn accepts just 'id'? Implementation plan said deleteVideo(suggestionId).
          // Let's do Promise.all
          await Promise.all(
            toDelete.map((docId) => deleteVideoFn({ suggestionId: docId })),
          );

          // Success! The background listener will eventually update `senderVideosState` and re-render.
          // But for instant feedback, we can close dropdown.
          dropdown.style.display = 'none';
        } catch (err) {
          console.error('Error unsending videos:', err);
          alert('Failed to unsend some videos.');
        } finally {
          saveBtn.textContent = 'Save Updates';
          saveBtn.disabled = false;
        }
      });

      return card;
    }

    function renderGrid(role) {
      const videoGrid = document.querySelector(
        `.video-grid[share-type="${role}"]`,
      );
      if (!videoGrid) return;

      const videos =
        role === 'receiver' ? receiverVideosState : senderVideosState;
      videoGrid.innerHTML = '';

      if (role === 'receiver') {
        // Standard rendering
        videos.forEach((data) => {
          videoGrid.appendChild(renderVideoCard(data, role));
        });
      } else {
        // Sender: Group By VideoID
        const groups = {}; // videoId -> { videoId, title, thumbnailUrl, recipients: [] }

        videos.forEach((v) => {
          if (!groups[v.videoId]) {
            groups[v.videoId] = {
              videoId: v.videoId,
              title: v.title,
              thumbnailUrl: v.thumbnailUrl,
              recipients: [],
            };
          }
          // Add recipient info
          groups[v.videoId].recipients.push({
            to: v.to,
            timestamp: v.timestamp ? v.timestamp.seconds : Date.now() / 1000,
            docId: v.id, // We need the document ID to delete it
          });
        });

        // Render groups
        Object.values(groups).forEach((group) => {
          const card = renderGroupedSenderVideoCard(group);
          if (card) videoGrid.appendChild(card);
        });
      }
    }

    function watchCollection(role) {
      const key =
        role === 'receiver' ? 'local:suggestedVideos' : 'local:sentVideos';

      const handleUpdate = (videos) => {
        if (!videos) return;
        if (role === 'receiver') receiverVideosState = videos;
        else senderVideosState = videos;
        renderGrid(role);
      };

      // Initial load
      storage.getItem(key).then(handleUpdate);

      // Watch
      storage.watch(key, handleUpdate);
    }

    watchCollection('receiver');
    watchCollection('sender');

    // ---------------------------
    // WATCH FRIENDSHIPS
    // ---------------------------
    function watchFriendships() {
      const friendsList = document.getElementById('friends-list');

      const render = (friends) => {
        if (!friends) return;
        friendsState = friends; // Update state

        // Render friends list
        friendsList.innerHTML = '';
        friends.forEach((friend) => {
          friendsList.appendChild(renderFriendTile(friend.id, friend));
        });

        // Re-render video grids to update names
        renderGrid('receiver');
        renderGrid('sender');
      };

      // Initial load
      storage.getItem('local:friendsList').then(render);

      // Watch for changes
      const unwatch = storage.watch('local:friendsList', render);

      return unwatch;
    }

    // ---------------------------
    // WATCH FRIEND REQUESTS
    // ---------------------------
    const batchGetUserProfilesFn = httpsCallable(
      functions,
      'batchGetUserProfiles',
    );

    function watchFriendRequests() {
      const reqGrid = document.querySelector('.friend-requests-grid');
      const requestCards = new Map();

      const handleUpdate = async (receivedRequests) => {
        receivedRequests = receivedRequests || {};
        const currentRequestUids = Array.from(requestCards.keys());
        const newRequestUids = Object.keys(receivedRequests);

        // Remove cards for requests that are no longer present
        currentRequestUids.forEach((uid) => {
          if (!newRequestUids.includes(uid)) {
            requestCards.get(uid)?.remove();
            requestCards.delete(uid);
          }
        });

        // Identify which UIDs we actually need to fetch (not already rendered)
        const uidsToFetch = newRequestUids.filter(
          (uid) => !requestCards.has(uid),
        );

        if (uidsToFetch.length === 0) return;

        try {
          // Fetch all needed profiles in ONE batch call
          const response = await batchGetUserProfilesFn({
            uids: uidsToFetch,
          });
          const { users, notFound } = response.data || {};

          if (notFound && notFound.length > 0) {
            console.warn('Some friend request UIDs not found:', notFound);
          }

          // Render cards for found users
          (users || []).forEach((user) => {
            // batchGetUserProfiles returns { uid, displayName, email, photoURL }
            const card = renderFriendRequestCard(user.uid, user.email);
            requestCards.set(user.uid, card);
            reqGrid.appendChild(card);
          });
        } catch (err) {
          console.error(
            'Error batch fetching profiles for friend requests:',
            err,
          );
        }
      };

      // Initial load
      storage.getItem('local:friendRequests').then(handleUpdate);

      // Watch
      storage.watch('local:friendRequests', handleUpdate);
    }

    // Watch friend requests
    watchFriendRequests();

    // Watch friendships (and trigger video re-renders)
    watchFriendships();

    // ---------------------------
    // SEND FRIEND REQUEST
    // ---------------------------
    const emailInput = document.getElementById('friend-email-input');
    const sendBtn = document.getElementById('send-friend-request');

    async function sendFriendRequest() {
      const targetEmail = emailInput.value.trim().toLowerCase();
      if (!targetEmail) return alert('Please enter an email address.');

      try {
        // 1. Find the user by email via Cloud Function
        const searchResult = await httpsCallable(
          functions,
          'searchUsersByEmail',
        )({ email: targetEmail });

        if (!searchResult || !searchResult.data) {
          return alert('User not found. They may not have signed up yet.');
        }

        const toUid = searchResult.data.uid;

        if (toUid === userId) {
          return alert("You can't send a friend request to yourself.");
        }

        // Check if already friends (client-side check for better UX)
        const friendshipDoc = await getDoc(doc(db, 'friendships', userId));
        if (friendshipDoc.exists() && friendshipDoc.data().friends?.[toUid]) {
          return alert('You are already friends with this user.');
        }

        // Check if request already sent
        const myRequestsDoc = await getDoc(doc(db, 'friendRequests', userId));
        if (myRequestsDoc.exists() && myRequestsDoc.data().sent?.[toUid]) {
          return alert('You have already sent a friend request to this user.');
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
