# ShareYT - Web Extension

A cross-browser web extension for sharing YT videos between friends

# File Structure

As of 10/27/2025, for feat/sharing-refine

```
SHAREYT
|
|----entrypoints > # See these wxt docs for more info: https://wxt.dev/guide/essentials/entrypoints.html
| |
| |----background > Folder for files in background context
| | |----ai.ts > Contains summarizeVideo() function and firebase Gemini integration (model of choice = Gemini 2.5 Flash Lite)
| | |----index.ts > Background context code, where user sign in, recommending, and summarizing videos happens [NOTE this is a semi-persistent context]
| | |----offscreenInteraction.ts > [Legacy code back when signInWithPopup was used for Chrome] Background helper that creates and manages an offscreen document to run Chrome-specific Firebase authentication safely, then cleans it up
| |
| |----content > Contains the contentscript that is injected when YouTube is detected
| | |----index.ts
| |
| |----dashboard > The html for the extension's dashboard page
| | |----index.html
| |
| |----offscreen > Folder for files in offscreen context
| | |----index.html
| | |----main.ts
| |
| |----popup > Folder for files in popup context
| | |----App.css
| | |----App.tsx
| | |----AuthContext.tsx
| | |----index.html
| | |----LoginForm.tsx
| | |----main.tsx
| | |----style.css
| |----dashboard-script.js > Code for the extension's dashboard page
|
|----functions > Contains all custom cloud functions for Firebase, used for safe writes to Firestore
| |
| |----src
|       |
|       |----index.ts
|
|----public
| |
| |----assets---|...(expandable folder, but irrelevant)
| |----icon-----|...(expandable folder, but irrelevant)
| |
| |----icon.png > Future icon for ShareYT
| |----index.html > Standard Firebase Hosting startup page, found at https://video-sync-10531.firebaseapp.com/ -- perhaps I will change this later to a ShareYT website?
| |----signInWithPopup.html > html page for signInWithPopup
| |----signInWithPopup.js > js file for signInWithPopup
| |
| | > Note that signInWithPopup is a seperate website hosted with firebase *, but needs another "firebase config" and initializeApp(firebaseConfig) call because this only context supports CDN imports (at least, I am pretty sure this is the reason)
| | > This is actually no longer used since the sign in mechanism changed for Chrome from signInWithPopup to now using manual OAuth...
| | > TODO - check how to implement Firebase app check - if it is still needed and if so, how to do this
| |
| |----wxt.svg > Default wxt logo, will be changed later
|
|
|----types > Contains the type definitions for SerializedUser and VideoRecommendation (how users/videos are stored)
| |----types.ts
|
|----utils
| |----firebase.ts
| |----messaging.ts
```
