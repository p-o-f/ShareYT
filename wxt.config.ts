import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ manifestVersion }) => {
    return {
      permissions: ['identity', 'offscreen', 'storage'],
      content_security_policy: {
        extension_pages:
          manifestVersion == 2
            ? "script-src 'self' https://apis.google.com/; object-src 'self'"
            : "script-src 'self'; object-src 'self'",
      },
      browser_specific_settings: {
        gecko: {
          id: 'shareyt-extension@shareyt.com', // pinned extension ID for Firefox, might be required for publishing/signing
          strict_min_version: '115.0', // minimum Firefox version
        },
      },
    };
  },
});
