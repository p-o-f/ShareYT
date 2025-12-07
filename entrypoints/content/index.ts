import { SerializedUser } from '@/types/types';

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
      button.onclick = async () => {
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
        console.log(`Subscribers: ${subscriberCount}`);
        console.log(`Thumbnail URL: ${thumbnailUrl}`);
        console.log('--------------------------------------------------');
      };
      // Add button to the left controls bar
      controls.appendChild(button);
      return true;
    };

    function createDropdown(anchorButton: HTMLElement) {
      let unwatch: (() => void) | null = null;
      const existing = document.querySelector('#custom-dropdown');
      if (existing) {
        existing.remove();
        document.removeEventListener('click', outsideClickHandler);
        return;
      }

      let selectedIds = new Set<string>();

      const container = document.createElement('div');
      container.id = 'custom-dropdown';
      container.style.position = 'absolute';
      container.style.width = '250px';
      container.style.background = '#fff';
      container.style.border = '1px solid #ccc';
      container.style.borderRadius = '6px';
      container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      container.style.zIndex = '9999';
      container.style.padding = '8px';
      container.style.fontFamily = 'Arial, sans-serif';
      container.style.color = '#000';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.maxHeight = '250px'; // max height of container containing selection options
      container.style.visibility = 'hidden'; // will set position then reveal

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
      search.style.color = '#000';
      container.appendChild(search);

      // Toolbar
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
      selectAllLabel.style.color = '#000';

      selectAllWrapper.appendChild(selectAllCheckbox);
      selectAllWrapper.appendChild(selectAllLabel);
      toolbar.appendChild(selectAllWrapper);
      container.appendChild(toolbar);

      // Item list
      const itemList = document.createElement('div');
      itemList.style.overflowY = 'auto';
      itemList.style.flex = '1';
      itemList.style.maxHeight = '160px';
      container.appendChild(itemList);

      // No results message
      const noResults = document.createElement('div');
      noResults.textContent = 'No results found';
      noResults.style.textAlign = 'center';
      noResults.style.color = '#666';
      noResults.style.padding = '8px';
      noResults.style.display = 'none';
      itemList.appendChild(noResults);

      // Footer
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
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';

      footer.appendChild(confirmBtn);

      const updateConfirmBtnState = () => {
        const anySelected = selectedIds.size > 0;
        confirmBtn.disabled = !anySelected;
        confirmBtn.style.opacity = anySelected ? '1' : '0.5';
      };

      confirmBtn.onclick = () => {
        const selectedUids = Array.from(selectedIds);
        console.log('Selected UIDs:', selectedUids);
        container.remove();
        document.removeEventListener('click', outsideClickHandler);
        window.removeEventListener('resize', reposition);
        if (unwatch) unwatch();

        const url = window.location.href;
        const getVideoIdFromUrl = (url: string) => {
          const match =
            url.match(/[?&]v=([^&]+)/) ||
            url.match(/youtu\.be\/([^?&]+)/) ||
            url.match(/\/embed\/([^?/?&]+)/);
          return match ? match[1] : null;
        };
        const videoId = getVideoIdFromUrl(url);
        const thumbnailUrl = videoId
          ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          : 'Thumbnail unavailable';
        const title = document.title;

        messaging.sendMessage('recommend:video', {
          videoId,
          to: selectedUids, // Sending array of UIDs
          thumbnailUrl,
          title,
        });
      };

      container.appendChild(footer);

      // Append to body to avoid transform-induced blur from the controls bar
      document.body.appendChild(container);

      // Position the dropdown relative to the YouTube player bar (above by default)
      const GAP = 8; // gap between bar and dropdown
      const containerWidth = 250; // sync with container.style.width

      const reposition = () => {
        const btnRect = anchorButton.getBoundingClientRect();
        const bar = (anchorButton.closest('.ytp-chrome-bottom') ||
          document.querySelector('.ytp-chrome-bottom')) as HTMLElement | null;
        const player = (bar?.closest('.html5-video-player') ||
          document.querySelector('.html5-video-player')) as HTMLElement | null;

        const barRect = bar?.getBoundingClientRect();
        const playerRect = player?.getBoundingClientRect();

        // Horizontal: align to button's left; clamp within player or viewport
        const desiredLeftVw = btnRect.left; // viewport coordinate
        const minLeftVw = playerRect ? playerRect.left : 0;
        const maxLeftVw =
          (playerRect ? playerRect.right : window.innerWidth) - containerWidth;
        const clampedLeftVw = Math.min(
          Math.max(desiredLeftVw, minLeftVw),
          maxLeftVw,
        );
        const leftPx = Math.round(clampedLeftVw + window.scrollX);

        // Vertical: prefer above the bar (or button) else place below
        const anchorTopVw = barRect ? barRect.top : btnRect.top;
        const aboveTopVw = anchorTopVw - container.offsetHeight - GAP;
        let topPx: number;
        if (aboveTopVw >= 0) {
          topPx = Math.round(aboveTopVw + window.scrollY);
        } else {
          const belowTopVw = (barRect ? barRect.bottom : btnRect.bottom) + GAP;
          topPx = Math.round(belowTopVw + window.scrollY);
        }

        container.style.left = `${leftPx}px`;
        container.style.top = `${topPx}px`;
        container.style.bottom = 'auto';
      };

      // Compute initial position then show the dropdown
      requestAnimationFrame(() => {
        reposition();
        container.style.visibility = 'visible';
      });

      // Keep anchored on resize or layout changes (e.g., theater mode)
      window.addEventListener('resize', reposition);

      function outsideClickHandler(e: MouseEvent) {
        if (
          !container.contains(e.target as Node) &&
          !anchorButton.contains(e.target as Node)
        ) {
          container.remove();
          document.removeEventListener('click', outsideClickHandler);
          window.removeEventListener('resize', reposition);
          if (unwatch) unwatch();
        }
      }
      setTimeout(() => {
        document.addEventListener('click', outsideClickHandler);
      }, 0);

      // --- Data Fetching and Population ---
      let items: any[] = [];

      const updateSelectAllState = (visibleFiltered: typeof items) => {
        const allVisibleSelected =
          visibleFiltered.length > 0 &&
          visibleFiltered.every((i) => !i.disabled && selectedIds.has(i.id));
        const noneVisibleSelected = visibleFiltered.every(
          (i) => !selectedIds.has(i.id),
        );

        if (allVisibleSelected) {
          selectAllCheckbox.checked = true;
          selectAllCheckbox.indeterminate = false;
        } else if (noneVisibleSelected) {
          selectAllCheckbox.checked = false;
          selectAllCheckbox.indeterminate = false;
        } else {
          selectAllCheckbox.indeterminate = true;
        }
      };

      const renderItems = (filter = '') => {
        itemList.innerHTML = ''; // clear
        const filtered = items.filter((item) =>
          item.label.toLowerCase().includes(filter.toLowerCase()),
        );

        if (filtered.length === 0 && items.length > 0) {
          noResults.style.display = 'block';
          itemList.appendChild(noResults);
        } else {
          noResults.style.display = 'none';
          filtered.forEach((item) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.marginBottom = '4px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.disabled = !!item.disabled;
            checkbox.checked = selectedIds.has(item.id);
            checkbox.id = `opt-${item.id}`;
            checkbox.onchange = () => {
              if (checkbox.checked) selectedIds.add(item.id);
              else selectedIds.delete(item.id);
              updateConfirmBtnState();
              updateSelectAllState(filtered);
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
            label.style.color = '#000';
            if (item.disabled) {
              row.style.opacity = '0.5';
              row.style.cursor = 'not-allowed';
            }

            row.appendChild(checkbox);
            row.appendChild(img);
            row.appendChild(label);
            itemList.appendChild(row);
          });
        }

        updateConfirmBtnState();
        updateSelectAllState(filtered);
      };

      // Now select-all only affects filtered items
      selectAllCheckbox.onchange = () => {
        const filter = search.value;
        const visibleItems = items.filter((item) =>
          item.label.toLowerCase().includes(filter.toLowerCase()),
        );

        if (selectAllCheckbox.checked) {
          visibleItems.forEach(
            (item) => !item.disabled && selectedIds.add(item.id),
          );
        } else {
          visibleItems.forEach((item) => selectedIds.delete(item.id));
        }
        renderItems(filter);
      };

      search.oninput = () => renderItems(search.value);

      const populateFriends = (friends: any[]) => {
        items = friends;
        if (items.length === 0) {
          items.push({
            id: 'example-friend',
            label: 'Example Friend',
            img: 'https://www.gravatar.com/avatar?d=mp',
            disabled: true,
          });
        }

        const onlyExampleFriend =
          items.length === 1 && items[0].id === 'example-friend';
        selectAllCheckbox.disabled = onlyExampleFriend;
        selectAllWrapper.style.opacity = onlyExampleFriend ? '0.5' : '1';

        renderItems();
      };

      // --- Main logic ---
      const handleFriendsUpdate = (friends: any[] | null) => {
        if (friends && Array.isArray(friends)) {
          populateFriends(friends);
        }
      };

      storage.getItem('local:friendsList').then((cachedFriends) => {
        if (cachedFriends && Array.isArray(cachedFriends)) {
          populateFriends(cachedFriends);
        } else {
          itemList.innerHTML =
            '<div style="padding: 8px; text-align: center; color: #666;">Loading friends...</div>';
          messaging.sendMessage('friends:updateCache');
        }
      });

      unwatch = storage.watch('local:friendsList', handleFriendsUpdate);
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
      button.textContent = '🔁';

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
