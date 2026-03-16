# Connections Page Documentation

## Scope
This document covers the Connections page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/connections.html`
- `src/styles/connections.css`
- `src/styles/nav.css`
- `src/js/connections.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/connections.js`
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/routes/admin.js` (admin context + mobile-app page content)
- `server/services/pushService.js`
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: page structure for user discovery, request panels, conversation UI, and modals.
- CSS3: responsive layout, chat panel behavior, modal styling, nav/search/notification overlays.
- JavaScript (Browser): stateful UI rendering, API calls, polling, typing indicators, modal and form interactions.
- JavaScript (Node.js): authenticated API routes for connections, chat, search, notifications, and admin/nav context.
- SQL (PostgreSQL): follows, requests, conversations, messages, privacy/presence, notifications, and moderation tables/queries.
- MongoDB query language: global post search scope (`/api/search`) used by nav search on this page.

## Features Implemented On This Page

### 1) Authenticated Connections Workspace
- Route is protected at `GET /connections` with `requireAuth`.
- Layout includes:
  - network summary and quick stats
  - user discovery/search block
  - follow/chat request inbox
  - integrated chat workspace (conversation list + message panel)
  - group-creation and user-list modals

### 2) Discovery and Connection Lists
- Search users by display name/username/course via `GET /api/connections/search`.
- Open list views for `following`, `followers`, `mutual` via `GET /api/connections/list`.
- Quick stat buttons also open filtered lists.
- User cards show:
  - profile info
  - relation status
  - presence state (active/inactive/hidden)
  - contextual actions (follow/unfollow/cancel request/chat)

### 3) Follow Relationship Flows
- Send follow request: `POST /api/connections/follow/request`
- Accept/decline follow request: `POST /api/connections/follow/respond`
- Cancel sent follow request: `POST /api/connections/follow/cancel`
- Unfollow: `POST /api/connections/unfollow`

### 4) Chat Request and Direct Chat Flows
- Incoming chat requests list: `GET /api/connections/chat-requests?type=incoming`
- Start chat/request chat: `POST /api/connections/chat/start`
- Accept/decline chat request: `POST /api/connections/chat/respond`
- Cancel pending chat request (supported by API): `POST /api/connections/chat/cancel`

### 5) Conversation Workspace
- Load conversations: `GET /api/connections/conversations`
- Load messages for active conversation: `GET /api/connections/conversations/:id/messages`
- Conversation actions:
  - mark read/unread
  - archive/unarchive
  - mute/unmute
  - delete conversation from own view
  - leave group conversation

### 6) Messaging Features
- Send message text and optional attachment with `FormData`: `POST /api/connections/conversations/:id/messages`
- Reply to a specific parent message (`parentMessageId`).
- Attachment preview/remove in composer.
- Emoji picker insertion.
- Typing presence:
  - publish typing state: `POST /api/connections/conversations/:id/typing`
  - retrieve typing users: `GET /api/connections/conversations/:id/typing`
- Message moderation actions:
  - delete own message: `DELETE /api/connections/messages/:id`
  - report other participant’s message: `POST /api/connections/messages/:id/report`

### 7) Group Chat Creation
- Create group modal with title + multi-select members.
- Group creation endpoint: `POST /api/connections/groups`
- Member source for selector: following list API.

### 8) Presence and Bootstrap
- Dashboard bootstrap: `GET /api/connections/bootstrap`
- Presence API for user activity visibility: `GET /api/connections/presence`
- Counts shown: following, followers, pending follow/chat requests.

### 9) Global Nav Enhancements (Loaded On Connections)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (scopes: all/posts/users/documents)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 10) Session / Logout UX
- Logout trigger calls `POST /api/logout`, then redirects to `/login`.

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: page/API routing and middleware flow.
- `cookie-parser`: session cookie parsing.
- `pg`: PostgreSQL connectivity for connections/chat/privacy/notifications/search.
- `multer`: multipart handling for chat message attachments (memory storage + size cap).
- `@google-cloud/storage`: media upload and signed URL generation.
- `firebase-admin`: push notification dispatch for new chat messages.
- `mongodb`: global post search data source used by nav search.

### Platform / Built-in APIs
- Browser APIs: `fetch`, `FormData`, `URL`, `URLSearchParams`, `setTimeout`, `setInterval`, `window.open`, DOM/event APIs.
- Node built-ins: `path` (server static/page path resolution), `crypto` (session ID generation in session store).

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant): `user_privacy_settings`, `user_presence`, `follow_requests`, `follows`, `chat_requests`, `chat_threads`, `chat_participants`, `chat_messages`, `chat_message_reports`, `chat_typing`, `chat_thread_user_state`, `blocked_users`, `hidden_post_authors`, `notifications`, `site_page_content`.
- MongoDB collections (nav search relevant): posts collection queried by global search.
- Cloud object storage for profile photos and chat attachments with signed access.
- Firebase Cloud Messaging token + delivery path via push service.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Stateful UI model:
  - central state object + `Map` caches for `messagesByConversation` and `typingByConversation`.
- Conversation refresh loop:
  - periodic polling every 4.5s for conversation/message/typing updates.
- Typing heartbeat control:
  - sends typing updates with throttle-like timing (~1.7s minimum gap) and auto-stop timeout (3s).
- Scroll behavior:
  - preserves “near-bottom” context and autoscrolls only when appropriate.
- Reply threading UX:
  - stores selected parent message, generates reply preview snippet, clears on send/cancel.
- Dynamic action rendering:
  - user card buttons and request actions vary by relation/request state.
- Group member normalization:
  - selected member IDs are deduplicated and validated before submit.
- Global nav search:
  - 220ms debounce + request-id stale-response guard.
- Notification navigation routing:
  - target URL normalization and post-id extraction for direct post jumps.

### Backend Algorithms
- One-time schema bootstrap:
  - lazy `ensureConnectionsReady()` and related table/index creation.
- Presence computation:
  - active/inactive derived from `last_active_at` within a 5-minute window, plus visibility privacy flag.
- Relationship derivation:
  - computes is-following/follows-you/request-sent/request-received using correlated existence checks.
- Chat start decision tree:
  - existing direct thread reuse -> follow-status check -> non-follower chat policy (`allow/request/deny`) -> request or thread creation.
- Direct-thread reuse algorithm:
  - checks active pair membership before creating a new direct thread.
- Group creation normalization:
  - sanitizes title, deduplicates members (`Set`), limits to 20, validates user existence and follow relationship.
- Conversation unread calculation:
  - derives unread count from `last_read_message_id`, `manual_unread`, and per-user `deleted_at`.
- Per-user conversation delete model:
  - uses `chat_thread_user_state.deleted_at` to hide historical messages without deleting the shared thread.
- Message mapping pipeline:
  - builds message DTOs with reply references, deleted-message placeholders, and signed attachment links.
- Typing presence window:
  - returns only typing rows updated within last 8 seconds.
- Push fan-out filtering:
  - excludes sender, muted users, and blocked relationships before sending notifications.

## Security Measures In Place (Current)
- Access control:
  - `/connections` page requires `requireAuth`.
  - `/api/connections`, `/api/preferences`, `/api/search`, `/api/notifications`, `/api/admin/me`, and `/api/site-pages/:slug` are authenticated with `requireAuthApi`.
- Session protection:
  - server-side session store with expiry, cleanup, and cookie/bearer session ID parsing.
- Rate limiting:
  - per-user, per-action rate buckets across search, follow/chat actions, conversation actions, typing, and reporting.
- Input hardening:
  - server-side text sanitization, numeric ID validation, enum validation, and bounded pagination/page-size parsing.
- Authorization enforcement:
  - request ownership checks (follow/chat response targets).
  - active-participant checks for conversation/message/typing endpoints.
  - sender-only message deletion enforcement.
- Privacy enforcement:
  - searchable/profile presence visibility flags respected in discovery results.
  - non-follower chat policy and follow-approval policy enforced server-side.
- Block safety:
  - bidirectional block checks prevent follow/chat/search interactions where blocked.
- Upload safeguards:
  - 25MB attachment size limit (`multer`), image/video MIME gating, explicit `LIMIT_FILE_SIZE` error handling (413 response).
- Signed media access:
  - profile photos, chat attachments, and mobile-app QR assets are served through signed URLs where applicable.
- Database safety:
  - parameterized SQL queries throughout routes/services.
  - transactional consistency with `BEGIN/COMMIT/ROLLBACK` and row locks (`FOR UPDATE`) for critical updates.
- Moderation protections:
  - message report uniqueness per reporter/message, self-report prevention, and deleted-message report blocking.
- Notification safety:
  - user-scoped read/read-all operations and unread counter updates.
  - push dispatch respects muted conversations and block relationships.
- Frontend output/link safety:
  - `escapeHtml` for HTML-rendered nav notification content.
  - `normalizeTargetUrl` restricts nav redirects to internal paths.
  - external mobile-app download link uses `noopener noreferrer`.

