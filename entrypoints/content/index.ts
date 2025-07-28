import { SerializedUser } from '@/types/types';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'], // TODO handle YT shorts format later
  runAt: 'document_idle',
  allFrames: true, // For YT vids in iframes
  async main(_ctx) {
    console.log('YouTube site/video detected');

    let uid = null;
    let email = null;
    let displayName = null;
    let photoURL = null;

    const userIsLoggedIn = async (): Promise<boolean> => {
      const user = await storage.getItem<SerializedUser>('local:user');
      if (user) {
        console.log('User is logged in');
        uid = user.uid;
        email = user.email;
        displayName = user.displayName;
        photoURL = user.photoURL;
        return true;
      }
      uid = null;
      email = null;
      displayName = null;
      photoURL = null;
      console.log('User is not logged in');
      return false;
    };

    const removeButton = (): boolean => {
      const button = document.querySelector('#log-title-button');
      if (button) {
        button.remove();
        return true;
      }
      return false;
    };

    const injectButton = (): boolean => {
      const controls = document.querySelector('.ytp-left-controls'); // This will be right indented if "video chapters" are enabled for the video, otherwise left indented
      // If controls are not found or the button already exists, exit early
      if (!controls || controls.querySelector('#log-title-button'))
        return false;

      // Create button container that matches YT's button style
      const button = document.createElement('div');
      button.id = 'log-title-button';
      button.className = 'ytp-button'; // Used to align with YT's other control buttons
      button.title = 'Click to log video details to the console'; // Tooltip text
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.textContent = '📝'; // Cleaner w/ big emoji and no text to match other icons
      button.style.fontSize = '16px';
      button.style.cursor = 'pointer';
      button.style.userSelect = 'none';

      // For tooltip
      button.onmouseenter = () => {
        button.style.opacity = '0.8';
      };
      button.onmouseleave = () => {
        button.style.opacity = '1';
      };

      // Logic intended for when button is clicked
      button.onclick = () => {
        const title = document.title;
        const url = window.location.href;

        // Try to find the channel name element (usually in the metadata section; doesn't work for iframes rn)
        const channelEl =
          document.querySelector('#owner-name a') ||
          document.querySelector('ytd-channel-name a');
        const channelName = channelEl?.textContent?.trim() || 'Unknown Channel';

        // Try to find subscriber count element (doesn't work for iframes rn)
        const subsEl =
          document.querySelector('#owner-sub-count') ||
          document.querySelector('yt-formatted-string#subscriber-count');
        const subscriberCount =
          subsEl?.textContent?.trim() || 'Subscriber count unavailable';

        const getVideoIdFromUrl = (url: string) => {
          // Supports both normal YT and iframe URLs
          const match =
            url.match(/[?&]v=([^&]+)/) ||
            url.match(/youtu\.be\/([^?&]+)/) ||
            url.match(/\/embed\/([^?/?&]+)/);
          return match ? match[1] : null;
        };

        const videoId = getVideoIdFromUrl(url); // https://www.youtube.com/watch?v=_B-W2wZCwhY <-- As an example, videoId is _B-W2wZCwhY
        const thumbnailUrl = videoId
          ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          : 'Thumbnail unavailable';

        console.log(`Video title: ${title}`);
        console.log(`URL: ${url}`);
        console.log(`Channel: ${channelName}`);
        console.log(`Subscribers: ${subscriberCount}`);
        console.log(`Thumbnail URL: ${thumbnailUrl}`);
      };

      // Add button to the left controls bar
      controls.appendChild(button);
      return true;
    };

    const waitForControls = () => {
      const observer = new MutationObserver(() => {
        injectButton();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      const intervalId = setInterval(() => {
        if (injectButton()) {
          clearInterval(intervalId); // Stop polling once inserted, otherwise poll every second
        }
      }, 1000);
    };

    // Start logging current playback time every 10 seconds, and get total duration once (since it doesn't change)
    const startLoggingTimeOnceReady = () => {
      const checkReady = setInterval(() => {
        const currentTimeEl = document.querySelector('.ytp-time-current');
        const durationTimeEl = document.querySelector('.ytp-time-duration');

        if (currentTimeEl && durationTimeEl) {
          clearInterval(checkReady); // Stop polling once ready

          console.log(
            'Video timer elements found (user is watching video), starting time logger every 10 seconds...',
          );

          setInterval(() => {
            const current = currentTimeEl.textContent?.trim() || 'N/A';
            const duration = durationTimeEl.textContent?.trim() || 'N/A'; // we need to constantly get this rather than 1x because if the video changes (i.e. the user clicks like a new vid from the one they were previously watching), it'll remain stuck like from the first video
            console.log(`Current Time: ${current} / Duration: ${duration}`);
          }, 10000); // Runs every 10 seconds
        }
      }, 1000); // Check every second until video player is ready
    };

    let hasStartedLogging = false;

    const injectAndMaintainButton = () => {
      const intervalId = setInterval(() => {
        userIsLoggedIn()
          .then((isLoggedIn) => {
            if (!isLoggedIn) {
              removeButton();
              return;
            }

            const alreadyInjected = document.querySelector('#log-title-button');
            if (alreadyInjected) return; // Exit early if button exists

            // Try to inject. If it fails (e.g., controls not present), don't start timers.
            const injected = injectButton();
            if (!injected) return;

            console.log('Button injected for logged-in user.');

            // Start logging only once
            if (!hasStartedLogging) {
              hasStartedLogging = true;
              startLoggingTimeOnceReady();
            }
          })
          .catch((err) => {
            console.error('Error in injectAndMaintainButton:', err);
            removeButton();
          });
      }, 1000); // Every second
    };

    injectAndMaintainButton();
  },
});
