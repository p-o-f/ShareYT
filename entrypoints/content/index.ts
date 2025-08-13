import { SerializedUser } from '@/types/types';
import { clean } from 'wxt';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'], // TODO handle YT shorts format later
  runAt: 'document_idle',
  allFrames: true, // For YT vids in iframes
  async main(_ctx) {
    console.log('YouTube site/video detected');
    // Keep track of observer and intervals so we can clear them on logout
    let controlsObserver: MutationObserver | null = null;
    let controlsIntervalId: ReturnType<typeof setTimeout> | null = null;
    let timeLoggerIntervalId: ReturnType<typeof setTimeout> | null = null;
    let timeLoggerReadyCheckerId: ReturnType<typeof setTimeout> | null = null;

    const injectButton = (): boolean => {
      const controls = document.querySelector('.ytp-left-controls');
      // This will be right indented if "video chapters" are enabled for the video, otherwise left indented; TODO hardstick the indentation
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

      // Logic for when button is clicked
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
        console.log('--------------------------------------------------');
        console.log(`Video title: ${title}`);
        console.log(`URL: ${url}`);
        console.log(`Channel: ${channelName}`);
        console.log(`Subscribers: ${subscriberCount}`);
        console.log(`Thumbnail URL: ${thumbnailUrl}`);
        console.log('--------------------------------------------------');
      };

      // Add button to the left controls bar
      controls.appendChild(button);
      return true;
    };

    function createDropdown(anchorButton: HTMLElement) {
      const existing = document.querySelector('#custom-dropdown');
      if (existing) {
        existing.remove(); // toggle behavior
        document.removeEventListener('click', outsideClickHandler);
        return;
      }

      const items = [
        {
          id: 'blackbear',
          label: 'Black Bear',
          img: 'https://placebear.com/32/32',
        },
        {
          id: 'polarbear',
          label: 'Polar Bear',
          img: 'https://placebear.com/32/32',
        },
        {
          id: 'elephant',
          label: 'Elephant',
          img: 'https://randomuser.me/api/portraits/women/1.jpg',
        },
        {
          id: 'monkey',
          label: 'Monkey',
          img: 'https://randomuser.me/api/portraits/men/2.jpg',
        },
        {
          id: 'parrot',
          label: 'Parrot',
          img: 'https://randomuser.me/api/portraits/women/3.jpg',
        },
        {
          id: 'rabbit',
          label: 'Rabbit',
          img: 'https://randomuser.me/api/portraits/men/4.jpg',
        },
        {
          id: 'snake',
          label: 'Snake',
          img: 'https://randomuser.me/api/portraits/women/5.jpg',
        },
      ];

      let selectedIds = new Set<string>();

      const container = document.createElement('div');
      container.id = 'custom-dropdown';
      container.style.position = 'absolute';
      container.style.top = `${anchorButton.getBoundingClientRect().top + window.scrollY - 275}px`; // TODO fix this 275px hack for more relative placement later
      container.style.left = `${anchorButton.getBoundingClientRect().left + window.scrollX}px`;
      container.style.width = '250px';
      container.style.background = '#fff';
      container.style.border = '1px solid #ccc';
      container.style.borderRadius = '6px';
      container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      container.style.zIndex = '9999';
      container.style.padding = '8px';
      container.style.fontFamily = 'Arial, sans-serif';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.maxHeight = '300px';

      // Search bar
      const search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search...';
      search.style.width = '100%';
      search.style.padding = '6px';
      search.style.marginBottom = '8px';
      search.style.boxSizing = 'border-box';
      search.style.border = '1px solid #ccc';
      search.style.borderRadius = '4px';
      container.appendChild(search);

      // Select/Deselect toolbar
      const toolbar = document.createElement('div');
      toolbar.style.display = 'flex';
      toolbar.style.justifyContent = 'space-between';
      toolbar.style.alignItems = 'center';
      toolbar.style.marginBottom = '6px';

      const selectAllWrapper = document.createElement('div');
      selectAllWrapper.style.display = 'flex';
      selectAllWrapper.style.alignItems = 'center';

      const selectAllCheckbox = document.createElement('input');
      selectAllCheckbox.type = 'checkbox';
      selectAllCheckbox.id = 'select-all';

      const selectAllLabel = document.createElement('label');
      selectAllLabel.textContent = ' Select all';
      selectAllLabel.style.marginLeft = '4px';

      selectAllWrapper.appendChild(selectAllCheckbox);
      selectAllWrapper.appendChild(selectAllLabel);

      toolbar.appendChild(selectAllWrapper);

      container.appendChild(toolbar);

      // Item list wrapper with scroll
      const itemList = document.createElement('div');
      itemList.style.overflowY = 'auto';
      itemList.style.flex = '1';
      itemList.style.maxHeight = '160px'; // Scroll after ~4-6 items
      container.appendChild(itemList);

      // Footer confirm button
      const footer = document.createElement('div');
      footer.style.display = 'flex';
      footer.style.justifyContent = 'flex-end';
      footer.style.marginTop = '8px';

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = 'Confirm';
      confirmBtn.style.background = '#1a73e8';
      confirmBtn.style.color = 'white';
      confirmBtn.style.border = 'none';
      confirmBtn.style.borderRadius = '4px';
      confirmBtn.style.padding = '6px 12px';
      confirmBtn.style.cursor = 'pointer';

      footer.appendChild(confirmBtn);

      // Render items
      const renderItems = (filter = '') => {
        itemList.innerHTML = ''; // clear
        const filtered = items.filter((item) =>
          item.label.toLowerCase().includes(filter.toLowerCase()),
        );

        filtered.forEach((item) => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.marginBottom = '4px';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = selectedIds.has(item.id);
          checkbox.id = `opt-${item.id}`;
          checkbox.onchange = () => {
            if (checkbox.checked) selectedIds.add(item.id);
            else selectedIds.delete(item.id);
          };

          const img = document.createElement('img');
          img.src = item.img;
          img.alt = '';
          img.style.width = '24px';
          img.style.height = '24px';
          img.style.borderRadius = '50%';
          img.style.marginLeft = '6px';

          const label = document.createElement('label');
          label.htmlFor = checkbox.id;
          label.textContent = ` ${item.label}`;
          label.style.marginLeft = '8px';

          row.appendChild(checkbox);
          row.appendChild(img);
          row.appendChild(label);
          itemList.appendChild(row);
        });
      };

      // Handlers
      selectAllCheckbox.onchange = () => {
        items.forEach((item) => {
          if (selectAllCheckbox.checked) selectedIds.add(item.id);
          else selectedIds.delete(item.id);
        });
        renderItems(search.value);
      };

      confirmBtn.onclick = () => {
        console.log('Selected IDs:', Array.from(selectedIds));
        container.remove();
        document.removeEventListener('click', outsideClickHandler);
      };

      search.oninput = () => renderItems(search.value);
      renderItems();

      container.appendChild(footer);
      document.body.appendChild(container);

      // Outside click handler
      function outsideClickHandler(e: MouseEvent) {
        if (
          !container.contains(e.target as Node) &&
          !anchorButton.contains(e.target as Node)
        ) {
          container.remove();
          document.removeEventListener('click', outsideClickHandler);
        }
      }
      setTimeout(() => {
        document.addEventListener('click', outsideClickHandler);
      }, 0);
    }

    const injectShareDropdownButton = (): boolean => {
      const controls = document.querySelector('.ytp-left-controls');
      if (!controls || controls.querySelector('#share-dropdown-button'))
        return false;

      const button = document.createElement('div');
      button.id = 'share-dropdown-button';
      button.className = 'ytp-button';
      button.title = 'Share this video';
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.fontSize = '16px';
      button.style.cursor = 'pointer';
      button.style.userSelect = 'none';
      button.textContent = '✉️';

      button.onmouseenter = () => {
        button.style.opacity = '0.8';
      };
      button.onmouseleave = () => {
        button.style.opacity = '1';
      };

      button.onclick = () => {
        createDropdown(button);
      };

      controls.appendChild(button);

      return true;
    };

    const removeButton = (buttonName: string): boolean => {
      const button = document.querySelector(buttonName);
      if (button) {
        button.remove();
        return true;
      }
      return false;
    };

    const waitForControls = () => {
      if (controlsObserver) controlsObserver.disconnect(); // Prevent duplicates
      controlsObserver = new MutationObserver(() => {
        if (isLoggedIn) {
          injectButton();
          injectShareDropdownButton();
        }
      });

      controlsObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      controlsIntervalId = setInterval(() => {
        if (!isLoggedIn) return; // Skip if user logged out
        if (
          injectButton() &&
          controlsIntervalId &&
          injectShareDropdownButton()
        ) {
          clearInterval(controlsIntervalId); // Stop polling once inserted
          controlsIntervalId = null;
        }
      }, 1000);
    };

    // Start logging current playback time every 10 seconds, and get total duration once (since it doesn't change)
    const startLoggingTimeOnceReady = () => {
      if (timeLoggerReadyCheckerId) clearInterval(timeLoggerReadyCheckerId);

      timeLoggerReadyCheckerId = setInterval(() => {
        if (!isLoggedIn) return;

        const currentTimeEl = document.querySelector('.ytp-time-current');
        const durationTimeEl = document.querySelector('.ytp-time-duration');

        if (currentTimeEl && durationTimeEl) {
          clearInterval(timeLoggerReadyCheckerId!);
          timeLoggerReadyCheckerId = null;

          console.log(
            'Video timer elements found (user is watching video), starting time logger every 10 seconds...',
          );

          timeLoggerIntervalId = setInterval(() => {
            if (!isLoggedIn) return;

            const current = currentTimeEl.textContent?.trim() || 'N/A';
            const duration = durationTimeEl.textContent?.trim() || 'N/A'; // we need to constantly get this rather than 1x because if the video changes (i.e. the user clicks like a new vid from the one they were previously watching), it'll remain stuck like from the first video
            if (current === duration && duration === 'N/A') {
              // some weird invalid case where we need to exit
              cleanUpState();
              return;
            }
            console.log(`Current Time: ${current} / Duration: ${duration}`);
          }, 10000); // Runs every 10 seconds
        }
      }, 1000); // Check every second until video player is ready
    };

    const cleanUpState = () => {
      const removeButtonStatus1 = removeButton('#log-title-button');
      const removeButtonStatus2 = removeButton('#share-dropdown-button');
      console.log('removeButtonStatus1:', removeButtonStatus1);
      console.log('removeButtonStatus2:', removeButtonStatus2);

      // Clean up observers and intervals
      if (controlsObserver) {
        controlsObserver.disconnect();
        controlsObserver = null;
      }
      if (controlsIntervalId) {
        clearInterval(controlsIntervalId);
        controlsIntervalId = null;
      }
      if (timeLoggerReadyCheckerId) {
        clearInterval(timeLoggerReadyCheckerId);
        timeLoggerReadyCheckerId = null;
      }
      if (timeLoggerIntervalId) {
        clearInterval(timeLoggerIntervalId);
        timeLoggerIntervalId = null;
      }
    };
    // START OF DRIVER CODE FOR MAIN: KEEPS CONTENT SCRIPT RUNNING SMOOTHLY ---------------------------------------------------------------------
    /* This is a way to keep track of logged in state; from testing, I found that the event watcher by itself is not sufficient to do this
    // the main problem is:
    // -the serializedUser watcher only runs in content script, which only runs when youtube.com or any eligible websites are open
    // -so when not logged in due to the watcher specifically (what if the user logged in from another page that ISN'T youtube?), we need to check storage
    // -but, we don't want to check storage every time or every x amount of time (i.e. polling) because that's expensive
    // so this is my workaround
    */
    console.log(
      "In contentscript (index.ts), watching storage for 'local:user' changes...",
    );

    let isLoggedIn: false | true = false; //default intiialization is false
    if (!isLoggedIn) {
      const loggedInBefore = await storage.getItem<number>( // only check from storage is loggedIn isn't true in local memory of contentscript
        'local:isLoggedInGlobal',
      );
      if (loggedInBefore && loggedInBefore > 0) {
        isLoggedIn = true;
        waitForControls();
        startLoggingTimeOnceReady();
      }
    }

    storage.watch<SerializedUser>(
      'local:user',
      async (currentUser, previousUser) => {
        console.log('User loginStatus changed:', { currentUser, previousUser });

        if (!currentUser && previousUser) {
          // User was previously logged in, now they are logged out
          isLoggedIn = false;
          console.log('isLoggedin status after logout:', isLoggedIn);
          cleanUpState();

          console.log(
            'All observers and intervals were cleared due to user logout',
          );
        } else {
          // User was previously logged out, now they are logged in
          isLoggedIn = true;

          console.log('isLoggedin status after login:', isLoggedIn);
          waitForControls();
          startLoggingTimeOnceReady();
        }
      },
    );

    let lastUrl = window.location.href;
    let navigationTimeout: ReturnType<typeof setTimeout> | null = null;

    // Check for YouTube SPA (Single Page Application) navigation every second
    setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl && isLoggedIn) {
        console.log('Detected SPA navigation:', {
          from: lastUrl,
          to: currentUrl,
        });
        lastUrl = currentUrl;

        // Debounce re-inits in case multiple changes happen quickly
        if (navigationTimeout) clearTimeout(navigationTimeout);
        navigationTimeout = setTimeout(() => {
          // Clean up old state
          cleanUpState();

          console.log('Re-initializing after navigation...');
          if (currentUrl != 'https://www.youtube.com/') {
            // TODO this needs to be more robust later
            waitForControls();
            startLoggingTimeOnceReady();
          }
        }, 200); // Debounce: wait 0.2s after navigation
      }
    }, 1000); // Poll every 1 second
    // END OF DRIVER CODE FOR MAIN ---------------------------------------------------------------------
  },
});
