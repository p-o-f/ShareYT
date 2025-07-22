export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main(_ctx) {
    console.log('YouTube site/video detected');

    const injectButton = () => {
      const controls = document.querySelector('.ytp-left-controls'); // This will be right indented if "video chapters" are enabled for the video, otherwise left indented
      // If controls are not found or the button already exists, exit early
      if (!controls || controls.querySelector('#log-title-button')) return;

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

        // Try to find the channel name element (usually in the metadata section)
        const channelEl =
          document.querySelector('#owner-name a') ||
          document.querySelector('ytd-channel-name a');
        const channelName = channelEl?.textContent?.trim() || 'Unknown Channel';

        // Try to find subscriber count element
        const subsEl =
          document.querySelector('#owner-sub-count') ||
          document.querySelector('yt-formatted-string#subscriber-count');
        const subscriberCount =
          subsEl?.textContent?.trim() || 'Subscriber count unavailable';

        const getVideoIdFromUrl = (url: string) => {
          const match =
            url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
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
    };

    const waitForControls = () => {
      const observer = new MutationObserver(() => {
        injectButton();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setInterval(injectButton, 1000); // Fallback in case MutationObserver misses something, needs to be polished later like polling loop or something
    };

    waitForControls();
  },
});
