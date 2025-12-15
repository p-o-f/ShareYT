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

  hooks: {
    'build:done': async (wxt) => {
      console.log('[MV3 Compliance] Post-build hook triggered');
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      try {
        const { stdout, stderr } = await execAsync(
          'node strip-firebase-urls.js',
        );
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
      } catch (error) {
        console.error('[MV3 Compliance] Failed to run strip script:', error);
      }
    },
  },

  vite: () => ({
    build: {
      rollupOptions: {
        // Plugin removed as it was ineffective against pre-bundled Firebase SDK
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
