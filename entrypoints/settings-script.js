export default defineUnlistedScript(async () => {
    console.log(
        'Settings script running in this manifest version',
        browser.runtime.getManifest().manifest_version,
    );

    console.log('Hello world from settings script!');
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
    // Settings functionality will be added here
});
