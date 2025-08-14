import { collection, onSnapshot } from 'firebase/firestore';
import { hashEmail } from '../utils/firebase';

export default defineUnlistedScript(async () => {
  async function loadSuggestedVideos() {
    let user = await storage.getItem('local:user');
    console.log(user);
    const userEmail = user.email;

    function renderVideoCard(data, role) {
      // role = "receiver" (inbox) or "sender" (outbox)
      const label =
        role === 'receiver'
          ? `Shared by ${data.suggestedBy || 'Unknown'}`
          : `Sent to ${data.sentTo || 'Unknown'}`;

      // Convert Firestore Timestamp to JS Date
      const dateObj = data.suggestedTime?.toDate
        ? data.createdAt.toDate()
        : null;

      // Format the date
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

    function watchCollection(path, role) {
      console.log(hashEmail(userEmail));
      const videoRef = collection(db, 'users', hashEmail(userEmail), path);
      const videoGrid = document.querySelector(
        `.video-grid[share-type=${role}]`,
      );

      onSnapshot(videoRef, (snapshot) => {
        videoGrid.innerHTML = ''; // Clear old videos
        snapshot.forEach((doc) => {
          const data = doc.data();
          videoGrid.appendChild(renderVideoCard(data, role));
        });
        console.log(`${role} updated`);
      });
    }

    // Watch both inbox and outbox
    watchCollection('inbox', 'receiver');
    watchCollection('outbox', 'sender');
  }

  await loadSuggestedVideos();
});
