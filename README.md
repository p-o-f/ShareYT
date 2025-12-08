# ShareYT - Web Extension

A free, cross-platform browser extension that allows you to easily share and react to YouTube videos with your friends.

# Stuff for Developers

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

To run development server:

```
npm run dev (for Chrome)
OR
npm run dev:firefox (for Firefox)
```

# Stuff for Reviewers (Chrome Web Store, Mozilla Addons, etc.)

## Host Permissions

**Permission:** `*://*.youtube.com/*`

**Justification:**
This extension provides an overlay directly on the YouTube video player to allow users to share videos with friends and view "sent" videos without leaving the page.

- **Content Script Injection:** The extension injects a "Share" button (`📝` and `🔁`) into the YouTube video player controls (`.ytp-left-controls`).
- **DOM Access:** It reads the video title and channel name from the DOM to provide context when sharing.
- **SPA Navigation:** It monitors URL changes to re-inject controls when the user navigates between videos on the single-page application.

## Identity

**Permission:** `identity`

**Justification:**
The extension requires user authentication to secure the sharing functionality.

- **OAuth2:** The extension uses `chrome.identity.launchWebAuthFlow` to authenticate users via Google Sign-In (Firebase Auth). This ensures that users can only send and receive video recommendations from their actual friends.

## Notifications

**Permission:** `notifications`

**Justification:**
The extension needs to alert the user immediately when they receive a new video recommendation from a friend, even if they are not currently looking at the YouTube tab.

- **Real-time Alerts:** When a backend listener triggers a "New Video Received" event, the extension uses `chrome.notifications.create` to show a system notification.
- **Interaction:** Clicking the notification opens the shared YouTube video in a new tab.

## Storage

**Permission:** `storage`

**Justification:**
The extension caches user data locally to improve performance and reduce network calls.

- **User Session:** Stores the serialized user session (UID, email, display name) to maintain login state across browser restarts.
- **Friends List:** Caches the user's friends list and "sent/received" video history to allow for instant UI rendering in the overlay.
- **Preferences:** Saves minimal user preferences such as the last known login state to handle logout cleanups.

## Remote Code

**Permission:** _N/A (Justification for "No Remote Code")_

**Justification:**
This extension does NOT execute remote code.

- It uses a strict Content Security Policy (CSP).
- All business logic is bundled within the extension package.
- It communicates with a backend (Firebase) only for data synchronization (JSON), not for fetching executable scripts.

## Data Usage

Data usage requirements and justifications for Chrome Web Store:

1.  **[x] Personally identifiable information**
    - **Why:** The extension stores the user's **Name** and **Email address** (via Google Auth) to identify them to their friends.
2.  **[x] Authentication information**
    - **Why:** The extension uses **Authentication codes/tokens** (Firebase Auth IDs) to manage the user's session securely.
3.  **[x] Personal communications**
    - **Why:** The core feature is sending messages (shared videos) between users. The extension stores these **messages/shares** in the database.
4.  **[x] Website content**
    - **Why:** To create "share cards", the extension reads the **text content** (Video Title) and **images** (Thumbnail URL) from the YouTube page.

# Privacy Policy

**Last Updated:** December 7, 2025

ShareYT ("we", "our", or "us") is dedicated to protecting privacy for its users. This Privacy Policy explains how we collect, use, and safeguard your information when you use our browser extension. This policy is subject to change in the future.

## 1. Information We Collect

We collect only the minimum amount of data necessary to provide the sharing features of ShareYT.

### A. Personal Information (via Google Sign-In)

When you log in to ShareYT, we authenticate you using **Google Firebase Authentication**. We collect and store:

- **Email Address:** To identify your account and allow friends to find you.
- **Display Name:** To show your name to friends when you send them a video.
- **User ID (UID):** A unique identifier assigned by Firebase to manage your account.
  This uses OAuth2.0 for authentication, so your email password is safe - it's like signing in with Google for any other service.

### B. User Content (Shared Videos)

When you share a video, we store:

- **Video Details:** The YouTube video ID, title, and thumbnail URL.
- **Sender & Recipient Info:** Your UID and the UID of the friend you are sending it to.
- **Timestamps:** When the video was shared.

### C. Usage Data

- **Friends List:** We maintain a list of user UIDs that you have connected with to populate your "Send to" list.

## 2. How We Use Your Information

We use your information strictly to facilitate the core functionality of the extension:

- **Authentication:** To verify your identity and secure your account.
- **Video Sharing:** To deliver the video recommendations you send to the correct friend.
- **Notifications:** To alert you (via browser notifications) when a friend sends you a video.

## 3. Data Storage and Security

- **Data Storage:** All user data is stored securely in **Google Firebase (Firestore & Authentication)**.
- **Security:** We rely on Firebase's industry-standard security infrastructure. All data transmission occurs over secure HTTPS connections.
- **Local Storage:** To improve performance, we locally cache your friends list and recent shares in your browser's local storage (`chrome.storage.local`). This data remains on your device and is synchronized with Firebase.

## 4. Data Sharing and Third Parties

- **No Sale of Data:** We do **not** sell, trade, or rent your personal identification information to others.
- **Service Providers:** We use Google Firebase as our backend service provider. Their use of your data is governed by the [Google Privacy Policy](https://policies.google.com/privacy).

## 5. Your Rights

You have the right to:

- **Access:** View the data we hold about you (by looking at your Dashboard or Friends list).
- **Rectify:** Update your profile information via your Google Account settings.
- **Delete:** You can request the deletion of your account and all associated data by contacting us or using usage deletion features if available in the dashboard. Unfriending a user triggers a cascade deletion of shared history between those two users.

## 6. Detailed Scope of Permissions

- **Host Permissions (`*://*.youtube.com/*`):** Used only to inject the "Share" button and read video titles for sharing. We do not track your browsing history.
- **Notifications:** Used only to alert you of incoming shares.

## 7. Contact Us

If you have any questions about this Privacy Policy, please contact us at: pf.experiments@gmail.com

# Architecture Updates (Dec 2025)

### 1. Single Source of Truth

The **Background Script** (`entrypoints/background/index.ts`) is now the single source of truth for all Firestore data.

- It maintains real-time listeners for `friendships`, `friendRequests`, and `suggestedVideos`.
- It synchronizes this data to `wxt` storage (`local:friendsList`, `local:suggestedVideos`, etc.).
- **UI Components** (Dashboard, Content Script) simply `watch` this storage for instant, reactive updates without querying Firestore directly.

### 2. Secure User Lookup

- **Old Way**: `emailHashes` collection (deprecated & removed).
- **New Way**: `searchUsersByEmail` Cloud Function.
  - Securely looks up users via Firebase Admin SDK.
  - Prevents email enumeration attacks.

### 3. Smart Notifications

- **Video Shared**: When a friend shares a video, the background script detects the _new_ addition and triggers a browser notification.
- **Clickable**: Clicking the notification instantly opens the shared video in a new tab.
- **Spam Prevention**: Notifications are suppressed on initial load/reload; only _live_ incoming videos trigger alerts.
- **Duplicate Handling**: Re-sharing the same video (same sender, recipient, videoId) overwrites the existing Firestore document. This does _not_ trigger a new notification, preventing spam.

### 4. Cascade Deletion

- Unfriending a user now triggers a **Cascade Deletion**.
- The `removeFriend` Cloud Function automatically deletes all videos shared between the two users (both sent and received) to maintain data hygiene.

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
