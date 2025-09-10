import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [
    '@wxt-dev/module-react',
    // '@wxt-dev/auto-icons', // for later, if can get it working
  ],
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
          id: 'shareyt-extension@shareyt.com',
          strict_min_version: '115.0',
        },
      },
      web_accessible_resources: [
        {
          resources: ['dashboard.html', 'dashboard-script.js'],
          matches: ['<all_urls>'],
        },
      ],
    };
  },
});
