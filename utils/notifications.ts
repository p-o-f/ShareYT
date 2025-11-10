export function createChromeNotification() {
  console.log('Creating Chrome notification');
  chrome.notifications.create('any-id', {
    title: 'Item Notification',
    iconUrl: '/icon/128.png',
    appIconMaskUrl: '/icon/128.png', // does not show up on MacOS
    message: 'hi', // does not show in this type
    contextMessage: 'hello from ShareYT', // shows up on MacOS
    type: 'list',
    items: [
      { title: 'Item 1', message: 'Description of Item 1' },
      { title: 'Item 2', message: 'Description of Item 2' },
    ],
    buttons: [],
  });
}
