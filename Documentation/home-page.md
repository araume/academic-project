# Home Page Documentation

## Scope
This document covers the Home page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/home.html`
- `src/styles/home.css`
- `src/js/home.js`
- `src/js/nav-admin-link.js`
- `server/routes/posts.js`
- `server/routes/profile.js`
- `server/routes/library.js`
- `server/routes/rooms.js`
- `server/routes/search.js`
- `server/routes/notifications.js`
- `server/routes/admin.js`
- `server/routes/auth.js` (logout)

## Programming Languages Used
- HTML5: Home page layout, feed/sidebars, modal structure.
- CSS3: dashboard layout, responsive rules, modal styling, visual states.
- JavaScript (Browser): feed rendering, post actions, modal flows, AI chat UX, nav search/notifications UX.
- JavaScript (Node.js): Home feed APIs, sidecard APIs, post CRUD/actions, AI endpoints, notifications/search services.
- SQL (PostgreSQL): profile/document/room/notification/search queries, access filtering, moderation checks.
- MongoDB query language: post feed retrieval, likes/comments/bookmarks/reports, post AI conversations/messages.

## Features Implemented On This Page

### 1) Home Dashboard Layout
- Authenticated Home page with:
  - top navigation (Home, Connections, Personal, Open Library, Community, Rooms)
  - feed composer and posts feed
  - right sidebar sidecards: Trending Discussions, Course Materials, Suggested Rooms
- Profile menu actions: Profile, Account, FAQ, About, Preferences, Logout.

### 2) Feed and Post Rendering
- Loads personalized feed from `GET /api/posts`.
- Renders post card metadata (author, relative time, counts, attachments).
- Supports post spotlight/opening via `/posts/:id`.
- Supports image lightbox for image attachments.

### 3) Post Composer and Editing
- Create post modal (`POST /api/posts`) with:
  - title/content
  - optional file attachment (image/video)
  - optional Open Library document attachment (mutually exclusive with file)
- Edit own posts (`PATCH /api/posts/:id`).
- Delete own posts (`DELETE /api/posts/:id`).

### 4) Post Actions
- Like/unlike (`POST /api/posts/:id/like`).
- Bookmark add/remove (`POST /api/posts/:id/bookmark`).
- Report post (`POST /api/posts/:id/report`).
- Share link (clipboard write with prompt fallback).
- Discussion modal:
  - load comments (`GET /api/posts/:id/comments`)
  - create comment (`POST /api/posts/:id/comments`)

### 5) Ask AI About Post
- Bootstrap conversation (`GET /api/posts/:id/ask-ai/bootstrap`).
- Send AI messages (`POST /api/posts/:id/ask-ai/messages`).
- Conversation persistence per user+post in Mongo collections.
- Attachment-aware context injection (including optional document excerpt/image context).

### 6) Open Library Attachment Flows
- Library picker modal (document search/list from `GET /api/library/documents`).
- Attach selected document in post payload.
- Open attachment details from `GET /api/library/documents/:uuid`.
- Open/view signed document link in new tab when available.

### 7) Sidebar Sidecards
- `GET /api/home/sidecards` returns:
  - trending discussions (recent/high-like posts)
  - recent course materials
  - suggested live rooms
- Quick actions:
  - open discussion
  - open material
  - join suggested room (`POST /api/rooms/:id/join`)

### 8) Global Nav Enhancements (Loaded On Home)
- Admin link injection (if allowed) via `GET /api/admin/me`.
- Mobile app modal entry using `GET /api/site-pages/mobile-app`.
- Global search modal using `GET /api/search` (All/Posts/Users/Documents scopes).
- Notifications menu:
  - unread count (`GET /api/notifications/unread-count`)
  - list (`GET /api/notifications`)
  - mark one read (`POST /api/notifications/:id/read`)
  - mark all read (`POST /api/notifications/read-all`)

### 9) Session / Logout UX
- Logout action calls `POST /api/logout` and redirects to `/login`.

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: route handling for Home, posts, search, notifications, profile, rooms.
- `cookie-parser`: session cookie parsing for authenticated web/API flows.
- `pg`: PostgreSQL queries for profile/documents/rooms/notifications/search.
- `mongodb`: MongoDB collections for feed, likes, comments, bookmarks, reports, AI chat storage.
- `multer`: memory-based multipart handling for post file uploads.
- `@google-cloud/storage`: object storage operations and signed URL generation.
- `openai`: Ask AI conversation responses.
- `pdf-parse`: library-document text extraction for AI context.

### Platform / Built-in APIs
- Browser APIs: `fetch`, `FormData`, `URL`, `URLSearchParams`, `sessionStorage`, `navigator.clipboard`, DOM/events.
- Node built-ins: `path` (file extension/context utilities).

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant): `profiles`, `documents`, `rooms`, `room_participants`, `blocked_users`, `hidden_post_authors`, notification/search support tables.
- MongoDB collections (page-relevant): `posts`, `post_likes`, `post_comments`, `post_bookmarks`, `post_reports`, `post_ai_conversations`, `post_ai_messages`.
- Cloud object storage for post/document media with signed delivery URLs.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Feed orchestration:
  - parallel bootstrap (`loadCurrentProfile`, `fetchPosts`, `fetchHomeSidecards`) via `Promise.all`.
- Relative-time formatter (`timeAgo`) used across posts/sidecards/nav.
- Library picker query debounce (250ms).
- Global search query debounce (220ms) and stale-request protection via incrementing `requestId`.
- Modal-driven finite state for:
  - create/edit/comment
  - post AI conversations
  - library picker/detail
  - spotlight post
- Attachment selection rule:
  - exactly one source path (uploaded file OR library document).
- Suggested room quick-join prejoin handoff:
  - stores room join context in `sessionStorage` before redirecting to `/rooms`.

### Backend Algorithms
- Feed ranking pipeline (`buildFeedRankingPipeline`):
  - combines engagement, recency decay, freshness boosts, follow boost, and course boost into `_feedScore`.
  - sorts by score then upload recency.
- Sidecard derivation:
  - trending posts constrained to last 3 days and sorted by likes/recency.
  - course materials filtered by visibility rules and signed links.
  - suggested rooms filtered by live state and visibility constraints.
- Visibility filtering:
  - posts/documents constrained by `public`, course-private, and uploader ownership rules.
- Exclusion filtering:
  - removes blocked/hidden authors from feed and search outputs.
- Post AI context assembly:
  - builds structured post/attachment context, optionally extracts doc excerpt, and includes recent chat history.
- Search pipeline:
  - scope-aware aggregate search (posts/users/documents) with result normalization.

## Security Measures In Place (Current)
- Access control:
  - `/home` is protected by `requireAuth`.
  - Home APIs (`/api/posts`, `/api/home`, `/api/library`, `/api/rooms`, `/api/search`, `/api/notifications`) are protected by `requireAuthApi`.
- Session protection:
  - server-managed session IDs with lookup/expiry controls; logout deletes session and clears cookie.
- Post authorization controls:
  - post ID validation via `ObjectId.isValid`.
  - edit/delete restricted to post owner.
- Content visibility and privacy enforcement:
  - feed/document access constrained by visibility, course, and ownership.
  - blocked/hidden-user filters applied in feed/search paths.
- Signed media access:
  - post/document/profile assets are returned as signed URLs for time-limited access.
- Upload safety controls:
  - post upload file size limit (50MB).
  - server-side mime/type gating for allowed attachment types (image/video).
- Database safety:
  - parameterized SQL queries in route/service layers.
  - transactional safeguards in room join and other critical state transitions.
- Room join protections:
  - rate limiting on join attempts.
  - invite-token digest validation for private rooms.
  - optional password verification for protected rooms.
  - state/capacity checks and blocked-user checks before join.
- Search abuse controls:
  - per-user in-memory rate limiting (`global_search` window).
  - bounded query/scope/limit sanitization.
- Notification access safety:
  - read/read-all endpoints are user-scoped and return updated unread counts.
- External-link safety in UI:
  - material/document external opens use `noopener`/`noreferrer` patterns where configured.

