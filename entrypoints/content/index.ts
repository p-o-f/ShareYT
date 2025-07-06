export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main(_ctx) {
    console.log('Hello content.');
  },
});
