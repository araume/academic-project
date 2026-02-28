# Profile Page Documentation

## Scope
This document covers the Profile page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/profile.html`
- `src/styles/profile.css`
- `src/styles/nav.css`
- `src/js/profile.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/profile.js`
- `server/routes/connections.js` (relation, moderation, presence actions used in profile view mode)
- `server/routes/posts.js` (bookmarks source)
- `server/routes/library.js` (course list source)
- `server/routes/admin.js` (admin context + nav site-page/mobile-app content)
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/routes/auth.js` (logout endpoint)
- `server/services/storage.js`
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: profile layout, view/edit sections, profile actions, and bookmarks modal.
- CSS3: profile card/grid styling, edit-mode states, posts/bookmarks presentation, responsive behavior.
- JavaScript (Browser): profile load/edit flows, relation/moderation actions, bookmarks modal logic, and post rendering.
- JavaScript (Node.js): profile APIs, profile feed aggregation, signed media handling, and integration with connections/posts services.
- SQL (PostgreSQL): profile/account data, community posts, relation/moderation state, and presence lookups.
- MongoDB query language: main-feed profile posts and bookmarked posts retrieval.

## Features Implemented On This Page

### 1) Authenticated Profile Workspace
- Route is protected at `GET /profile` with `requireAuth`.
- Supports:
  - own profile mode (`/profile`)
  - viewed-user mode (`/profile?uid=...`)

### 2) Profile View and Edit
- Load own profile: `GET /api/profile`
- Load other user profile: `GET /api/profile/:uid`
- Save profile fields: `PATCH /api/profile`
- Editable fields:
  - display name, bio
  - main course + sub courses
  - social links (Facebook/LinkedIn/Instagram/GitHub)
  - portfolio URL

### 3) Profile Photo Upload
- Upload endpoint: `POST /api/profile/photo`
- Updates profile photo and refreshes displayed avatar.

### 4) Presence and Relationship Controls
- Presence fetch: `GET /api/connections/presence?uid=...`
- User-state/moderation fetch: `GET /api/connections/user-state?uid=...`
- Follow controls:
  - follow request: `POST /api/connections/follow/request`
  - cancel request: `POST /api/connections/follow/cancel`
  - unfollow: `POST /api/connections/unfollow`
- Profile options:
  - hide/unhide posts from user
  - block/unblock user
  - report user
  - copy profile link

### 5) Profile Posts Aggregation
- Own feed endpoint: `GET /api/profile/posts/feed`
- Viewed feed endpoint: `GET /api/profile/:uid/posts/feed`
- Displays:
  - main feed posts
  - community posts (when access rules allow)
- Includes post stats and quick open actions.

### 6) Bookmarked Posts Modal (Own Profile)
- Bookmarks endpoint: `GET /api/posts/bookmarks?limit=30`
- Displays saved post list with metadata and open-post action.

### 7) Course Option Bootstrap
- Course selector options source: `GET /api/library/courses`

### 8) Global Nav Enhancements (Loaded On Profile)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 9) Session / Logout UX
- Logout: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: profile and related API routing.
- `cookie-parser`: session cookie parsing in authenticated flows.
- `pg`: profile/account/community SQL access.
- `mongodb`: post/bookmark retrieval for profile feed and bookmarks modal.
- `multer`: profile photo multipart parsing with file size cap.
- `@google-cloud/storage`: profile/media upload, delete, and signed URL generation.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - `FormData`
  - `URLSearchParams`
  - `navigator.clipboard`
  - `window.confirm`, `window.prompt`
  - DOM/event APIs
- Node/runtime:
  - SQL + Mongo aggregation helpers and signed-link mapping utilities.

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant): `profiles`, `accounts`, `communities`, `community_posts`, `community_comments`, `blocked_users`, `hidden_post_authors`, relation tables in connections module.
- MongoDB collections (page-relevant): `posts`, `post_bookmarks`.
- Cloud object storage for profile photos and signed post/profile media links.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Dual-mode profile resolver:
  - auto-selects own or target profile endpoint based on `uid` query param.
- Edit-mode state machine:
  - toggles view/edit cards and upload control visibility based on ownership.
- Action-aware relation UI:
  - follow button and moderation menu labels are derived from live relation/moderation state.
- Profile-post grouping:
  - renders main-feed and community posts as separate sections with source-aware actions.
- Fallback avatar generation:
  - builds SVG data-URL initials avatar when no photo exists.

### Backend Algorithms
- Lazy profile bootstrap (`ensureProfile`):
  - auto-creates a `profiles` row from account defaults on first access.
- Profile feed visibility matrix:
  - suppresses content when blocked/hidden relations exist.
  - gates community posts by same-course/self/admin privileges.
- Attachment signing pipeline:
  - signs non-HTTP media keys for profile and post attachments.
- Text summarization:
  - normalizes/truncates post content for profile feed previews.

## Security Measures In Place (Current)
- Access control:
  - `/profile` is protected by `requireAuth`.
  - `/api/profile` endpoints are protected by `requireAuthApi`.
  - related action endpoints used by this page (`/api/connections/*`, `/api/posts/bookmarks`, nav APIs) are authenticated.
- Ownership and target checks:
  - own-profile edit/upload operations are user-scoped to authenticated UID.
  - viewed-profile actions validate target existence and self-target restrictions where required.
- Upload safety controls:
  - profile photo upload has a 5MB limit with explicit `LIMIT_FILE_SIZE` handling.
- Privacy enforcement:
  - blocked/hidden-author relationships suppress profile feed visibility for non-owner viewers.
  - community post visibility is course/role constrained.
- Moderation interaction safeguards:
  - block/unblock/hide/unhide/report/follow operations apply server-side validation and target checks.
- Rate limiting:
  - profile-related moderation endpoints use per-action rate limits in the connections service.
- Signed media delivery:
  - profile and supported post attachments are returned as signed URLs.
- Data-layer safety:
  - SQL operations use parameterized queries.

