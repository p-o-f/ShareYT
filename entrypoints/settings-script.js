export default defineUnlistedScript(async () => {
  console.log(
    'Settings script running in this manifest version',
    browser.runtime.getManifest().manifest_version,
  );
  
  console.log('Hello world from settings script!');
  
  // Settings functionality will be added here
});
