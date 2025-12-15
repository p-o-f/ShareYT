import { defineConfig } from 'wxt';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  modules: [
    '@wxt-dev/module-react',
    // '@wxt-dev/auto-icons', // for later, if can get it working
  ],

  webExt: {
    chromiumArgs: isDev
      ? ['--disable-blink-features=AutomationControlled'] // in dev mode, helps fix unsecure issue with Chromium login - DO NOT use in production
      : [], // production: no dev flags
    // see below for more info:
    // https://github.com/wxt-dev/wxt/issues/1971
    // https://github.com/wxt-dev/wxt/issues/1890
  },

  vite: () => ({
    build: {
      rollupOptions: {
        plugins: [
          {
            name: 'replace-firebase-appcheck-urls',
            renderChunk(code, chunk) {
              // Process all chunks to replace Firebase App Check URL strings
              // These URLs are embedded in Firebase Functions SDK and trigger MV3 violations
              const modified = code
                .replace(/"https:\/\/apis\.google\.com\/js\/api\.js"/g, '""')
                .replace(
                  /"https:\/\/www\.google\.com\/recaptcha\/api\.js"/g,
                  '""',
                )
                .replace(
                  /"https:\/\/www\.google\.com\/recaptcha\/enterprise\.js\?render="/g,
                  '""',
                );

              // Only return if we actually made changes
              if (modified !== code) {
                console.log(
                  `[MV3 Compliance] Stripped remote URLs from ${chunk.fileName}`,
                );
                return { code: modified, map: null };
              }
              return null;
            },
          },
        ],
      },
    },
  }),

  manifest: ({ manifestVersion }) => {
    return {
      permissions: ['identity', /*'offscreen',*/ 'storage', 'notifications'],
      content_security_policy: {
        extension_pages:
          manifestVersion == 2
            ? "script-src 'self' https://apis.google.com/; object-src 'self'"
            : "script-src 'self'; object-src 'self'",
      },
      browser_specific_settings: {
        gecko: {
          id: 'shareyt-extension@shareyt.dev',
          strict_min_version: '115.0',
          data_collection_permissions: {
            optional: ['technicalAndInteraction'], // data sent to Firestore is not collected by Mozilla
            required: ['none'],
          },
        },
      },
      web_accessible_resources: [
        {
          resources: [
            'dashboard.html',
            'dashboard-script.js',
            'settings.html',
            'settings-script.js',
          ],
          matches: ['<all_urls>'],
        },
      ],
    };
  },
});
