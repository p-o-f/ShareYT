# ShareYT - Web Extension

A cross-browser web extension for sharing YT videos between friends

To update wxt:

```
npm install wxt@latest --ignore-scripts
npx wxt prepare
```

To update Firebase Admin SDK:

```
npm install firebase-admin@latest
```

To update version for Chrome/Mozilla web store:
```
npm version patch
```

# Architecture Updates (Dec 2025)

### 1. Single Source of Truth
The **Background Script** (`entrypoints/background/index.ts`) is now the single source of truth for all Firestore data.
-   It maintains real-time listeners for `friendships`, `friendRequests`, and `suggestedVideos`.
-   It synchronizes this data to `wxt` storage (`local:friendsList`, `local:suggestedVideos`, etc.).
-   **UI Components** (Dashboard, Content Script) simply `watch` this storage for instant, reactive updates without querying Firestore directly.

### 2. Secure User Lookup
-   **Old Way**: `emailHashes` collection (deprecated & removed).
-   **New Way**: `searchUsersByEmail` Cloud Function.
    -   Securely looks up users via Firebase Admin SDK.
    -   Prevents email enumeration attacks.

### 3. Smart Notifications
-   **Video Shared**: When a friend shares a video, the background script detects the *new* addition and triggers a browser notification.
-   **Clickable**: Clicking the notification instantly opens the shared video in a new tab.
-   **Spam Prevention**: Notifications are suppressed on initial load/reload; only *live* incoming videos trigger alerts.
-   **Duplicate Handling**: Re-sharing the same video (same sender, recipient, videoId) overwrites the existing Firestore document. This does *not* trigger a new notification, preventing spam.

### 4. Cascade Deletion
-   Unfriending a user now triggers a **Cascade Deletion**.
-   The `removeFriend` Cloud Function automatically deletes all videos shared between the two users (both sent and received) to maintain data hygiene.

# File Structure

As of 12/6/2025, for feat/sharing-refine

```
SHAREYT
|
|----entrypoints > # See these wxt docs for more info: https://wxt.dev/guide/essentials/entrypoints.html
| |
| |----background > Folder for files in background context
| | |----ai.ts > Contains summarizeVideo() function and firebase Gemini integration (model of choice = Gemini 2.5 Flash Lite)
| | |----index.ts > Background context code (Central Data Hub). Handles Auth, Listeners, Notifications.
| | |----offscreenInteraction.ts > [Legacy]
| |
| |----content > Contains the contentscript that is injected when YouTube is detected
| | |----index.ts > Uses storage.watch() for reactive dropdown.
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
| |----dashboard-script.js > Code for the extension's dashboard page (Refactored to use storage)
|
|----functions > Contains all custom cloud functions for Firebase, used for safe writes to Firestore
| |
| |----src
|       |
|       |----index.ts > Cloud Functions: searchUsersByEmail, removeFriend (cascade), suggestVideo, etc.
|
|----public
| |
| |----assets---|...(expandable folder, but irrelevant)
| |----icon-----|...(expandable folder, but irrelevant)
| |
| |----icon.png > Future icon for ShareYT
| |----index.html > Standard Firebase Hosting startup page
| |----signInWithPopup.html > html page for signInWithPopup
| |----signInWithPopup.js > js file for signInWithPopup
| |
| |----wxt.svg > Default wxt logo
|
|
|----types > Contains the type definitions for SerializedUser and VideoRecommendation (how users/videos are stored)
| |----types.ts
|
|----utils
| |----firebase.ts
| |----messaging.ts
| |----listeners.ts > Reusable Firestore listener definitions (used by background script).
| |----notifications.ts > Browser notification utility (Cross-browser support).
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
