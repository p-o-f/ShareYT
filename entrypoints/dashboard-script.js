import { collection, getDocs } from 'firebase/firestore';

export default defineUnlistedScript(async () => {
  async function loadSuggestedVideos() {
    let user = await storage.getItem('local:user');
    const userId = user.uid;
    console.log(userId);
    const videoRef = collection(db, 'users', userId, 'inbox');
    // TODO: Turn this into onSnapshot
    const snapshot = await getDocs(videoRef);

    const videoGrid = document.querySelector(
      '.video-grid[share-type=receiver]',
    );
    videoGrid.innerHTML = ''; // Clear existing

    snapshot.forEach((doc) => {
      const data = doc.data();
      const html = `
      <div class="video-card">
        <div class="video-thumbnail">320 × 180</div>
        <div class="video-info">
          <strong>${data.title || 'Untitled Video'}</strong><br />
          <small>Shared by ${data.suggestedBy} · ??? ago</small><br />
          <input type="checkbox" ${data.watched ? 'checked' : ''}/> Mark as Watched
          <span style="float: right; color: #3b4cca; cursor: pointer">Watch</span>
        </div>
      </div>
    `;
      videoGrid.insertAdjacentHTML('beforeend', html);
    });
  }
  // TODO: is there a better way than getting the auth again?
  await loadSuggestedVideos();
  console.log('done');
});
