export function createBrowserNotification(
  title: string = 'Default Title',
  message: string = 'Default Message',
  //contextMessage: string = '', // default none
  //buttons: Array<{ title: string; iconUrl?: string }> = [], // default none
  isClickable: boolean = true, // <-- Whether clicking the body of the notification triggers a notifications.onClicked event
) {
  console.log('Creating browser notification');

  return browser.notifications.create({
    type: 'basic',
    iconUrl: '/icon/128.png', // points to /public/icon/128.png
    title,
    message,
    //contextMessage,
    //buttons,
    isClickable,
  });
}

/* NOTIFICATION PROPERTIES - good to use what is supported in both browsers
-----------------------------------------------------------------------------
Property	        Description	            Chrome	    Firefox
-----------------------------------------------------------------------------
title	            Bold header text	    ✅	        ✅
message	            Main text content	    ✅	        ✅
contextMessage	    Secondary smaller text	✅	        ⚠️ (often ignored)
priority	        Controls importance	    ✅	        ⚠️ (ignored)
eventTime	        Timestamp for ordering	✅	        ⚠️ (ignored)
buttons	            Up to 2 action buttons	✅	        ❌
requireInteraction	Stay visible until closed✅	        ❌
isClickable	        Detect body click	    ✅	        ✅
*/
