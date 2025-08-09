import { collection, onSnapshot } from 'firebase/firestore';

export default defineUnlistedScript(async () => {
  async function loadSuggestedVideos() {
    let user = await storage.getItem('local:user');
    const userId = user.uid;
    console.log(userId);
    const videoRef = collection(db, 'users', userId, 'inbox');
    const snapshot = onSnapshot(videoRef, (snapshot) => {
      const videoGrid = document.querySelector(
        '.video-grid[share-type=receiver]',
      );
      videoGrid.innerHTML = ''; // Clear existing

      snapshot.forEach((doc) => {
        const data = doc.data();
        console.log(data.thumbnailUrl);
        const html = `
<div class="video-card" style="display: block;">
  <div class="video-thumbnail" style="width: 100%;">
    <img src="${data.thumbnailUrl}" alt="Video Thumbnail" style="width: 100%; height: auto; display: block;" />
  </div>
  <div class="video-info" style="margin-top: 8px;">
    <strong>${data.title || 'Untitled Video'}</strong><br />
    <small>Shared by ${data.suggestedBy || 'Unknown'} · zz</small><br />
    <input type="checkbox" ${data.watched ? 'checked' : ''}/> Mark as Watched
    <span class="watch-btn" style="float: right; color: #3b4cca; cursor: pointer;">Watch</span>
  </div>
</div>
  `;

        // Append element and add event listener
        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        const card = temp.firstChild;

        card.querySelector('.watch-btn').addEventListener('click', () => {
          window.open(
            `https://www.youtube.com/watch?v=${data.videoId}`,
            '_blank',
          );
        });

        videoGrid.appendChild(card);
      });
      console.log('updated');
    });
  }
  await loadSuggestedVideos();
});
