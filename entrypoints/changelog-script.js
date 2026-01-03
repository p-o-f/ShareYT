export default defineUnlistedScript(async () => {
  console.log(
    'Changelog script running in this manifest version',
    browser.runtime.getManifest().manifest_version,
  );

  console.log('Hello world from changelog script!');
  const user = await storage.getItem('local:user');
  if (!user) {
    // Edge case where user enters direct URL without being logged in
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
        <h2>Please log in to ShareYT first to view your dashboard. If you are logged in, please refresh the page.</h2>
      </div>
    `;
    return;
  }

  // Edge case where the user logs out while they're still on the page
  storage.watch('local:user', (user) => {
    if (!user) {
      location.reload(); // show dashboard to user again
      return;
    }
  });

  // Fetch and display changelog
  const changelogContainer = document.getElementById('changelog-content');
  if (changelogContainer) {
    try {
      const response = await fetch(chrome.runtime.getURL('/changelog.txt'));
      if (!response.ok) throw new Error('Failed to load changelog');
      const text = await response.text();

      let html = '';
      const lines = text.split('\n');

      lines.forEach((line) => {
        line = line.trim();
        // Skip empty lines unless you want spacing
        if (!line) return;

        if (line.startsWith('[')) {
          // Header: e.g. [1/2/2026, v0.0.5]
          html += `<h3 style="color: rgba(239, 57, 57); margin-top: 1.5rem; margin-bottom: 0.5rem;">${line}</h3>`;
        } else if (line.startsWith('-')) {
          // List item: e.g. - Added changelog page.
          html += `<div style="margin-left: 1rem; margin-bottom: 0.25rem;">• ${line.substring(1).trim()}</div>`;
        } else {
          // Regular paragraph
          html += `<p>${line}</p>`;
        }
      });

      changelogContainer.innerHTML = html;
    } catch (e) {
      console.error(e);
      changelogContainer.innerHTML = '<p>Error loading changelog.</p>';
    }
  }
});
