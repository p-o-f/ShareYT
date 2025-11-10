# ShareYT - Web Extension

A cross-browser web extension for sharing YT videos between friends

To update wxt:

```
npm install wxt@latest --ignore-scripts
npx wxt prepare
```

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

## Auth and billing notes

- Firebase Authentication vs Identity Platform
  - Plain Firebase Authentication (default) does not charge per monthly active user (MAU) for common providers (email/password, Google, etc.). Phone Auth is billed per verification.
  - Authentication with Identity Platform (the Google Cloud upgrade) is billed by MAU: each distinct account that successfully signs in at least once in a month counts as 1 MAU (free tier applies, then charges).
  - How to check which you’re on: Firebase Console → Authentication → Settings. If Identity Platform is enabled (also visible in Google Cloud Console → Identity Platform), MAU pricing applies.

- Does `admin.auth().getUser(uid)` cost a Firestore read?
  - No. It calls the Firebase Authentication Admin API, not Firestore. There are no Firestore read charges from this call. Normal Cloud Functions billing still applies.
  - If you need many users at once, prefer `admin.auth().getUsers([...])` (batch up to 100) to reduce round trips, or maintain a minimal “profiles” document in Firestore for bulk reads.

- What does `listUsers()` do?
  - `admin.auth().listUsers(maxResults?, pageToken?)` iterates Auth users (not Firestore) and returns user records (uid, email, displayName, providers, customClaims, metadata, etc.).
  - It’s paginated (up to 1000 per page). There’s no server-side filtering/sorting—iterate and filter client-side.
  - Costs/rate limits are Auth API related, not Firestore reads, and it doesn’t create MAUs by itself.
  - Common use cases: exports/migrations, audits, backfills (e.g., creating Firestore profile docs from Auth), cleaning up disabled users.

- Enforcing callable auth
  - Callable functions like `getUserProfile` can enforce signed-in callers with `if (!context.auth) throw new HttpsError('unauthenticated', ...)`. The Admin SDK inside the function is still privileged regardless of Firestore Security Rules.
