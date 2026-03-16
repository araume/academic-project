# Admin Page Documentation

## Scope
This document covers the Admin page implementation and the admin/nav services loaded on this page.

Primary files:
- `src/pages/admin.html`
- `src/styles/admin.css`
- `src/styles/nav.css`
- `src/js/admin.js`
- `src/js/nav-basic.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/admin.js`
- `server/middleware/requireOwnerOrAdmin.js`
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/services/auditLog.js`
- `server/services/storage.js`
- `server/auth/sessionStore.js`
- `server/db/mongo.js`

## Programming Languages Used
- HTML5: admin console layout, tabbed panels, filter controls, data tables, and site-content editors.
- CSS3: admin dashboard layout, tab styling, table controls, action states, and responsive behavior.
- JavaScript (Browser): tab state, API-driven table rendering, moderation/account actions, and site-page editor workflows.
- JavaScript (Node.js): admin access guards, account moderation APIs, report aggregation, content moderation endpoints, and site-page management APIs.
- SQL (PostgreSQL): audit logs, accounts/roles/ban state, communities/moderators, community content, library documents, and site-page content.
- MongoDB query language: main feed posts/comments/reports and account-related content cleanup.

## Features Implemented On This Page

### 1) Authenticated Admin Console
- Page route: `GET /admin` protected by `requireAuth` + `requireOwnerOrAdmin`.
- Tabs in console:
  - Logs
  - Reports
  - Accounts
  - Content
  - Spaces
  - Site pages

### 2) Admin Context and Role Bootstrap
- Context endpoint: `GET /api/admin/me`
- Validates admin eligibility and resolves current platform role (`owner`/`admin`).

### 3) Logs Tab (Audit Monitoring)
- Endpoint: `GET /api/admin/logs`
- Supports filters:
  - text query
  - executor UID
  - course
  - sort order
- Displays action metadata including sanitized internal target links.

### 4) Reports Tab (Cross-source Report Review)
- Endpoint: `GET /api/admin/reports`
- Aggregates reports from:
  - profile reports
  - community reports
  - main feed post reports
  - chat message reports
- Supports source, status, course, and text filtering.

### 5) Accounts Tab (Identity and Enforcement)
- List endpoint: `GET /api/admin/accounts`
- Filters:
  - query text
  - course
  - role
  - status (`verified`/`non-verified`/`banned`)
- Account actions:
  - role update: `PATCH /api/admin/accounts/:uid/role`
  - ban/unban: `PATCH /api/admin/accounts/:uid/ban`
  - delete account: `DELETE /api/admin/accounts/:uid`
  - transfer ownership: `POST /api/admin/accounts/:uid/transfer-ownership`

### 6) Moderator Assignment Tools
- Community list endpoint: `GET /api/admin/communities`
- Moderator update endpoint:
  - `POST /api/admin/communities/:id/moderators/:uid` with action `assign|remove`
- Also ensures target membership when assigning moderator role.

### 7) Content Tab (Moderation by Domain)
- Main feed posts:
  - list: `GET /api/admin/content/main-posts`
  - delete: `DELETE /api/admin/content/main-posts/:id`
- Main feed comments:
  - list: `GET /api/admin/content/main-comments`
  - delete: `DELETE /api/admin/content/main-comments/:id`
- Community posts:
  - list: `GET /api/admin/content/community-posts`
  - takedown: `POST /api/admin/content/community-posts/:id/takedown`
- Community comments:
  - list: `GET /api/admin/content/community-comments`
  - takedown: `POST /api/admin/content/community-comments/:id/takedown`
- Library documents:
  - list: `GET /api/admin/content/library-documents`
  - delete: `DELETE /api/admin/content/library-documents/:uuid`

### 8) Spaces Tab (Community/Rooms Configuration)
- Community description update:
  - `PATCH /api/admin/communities/:id/details`
- Rooms label editor (for Rooms page create form context label):
  - `GET /api/admin/site-pages/rooms`
  - `PATCH /api/admin/site-pages/rooms`

### 9) Site Pages Tab (Public Content Management)
- About editor:
  - load: `GET /api/admin/site-pages/about`
  - save: `PATCH /api/admin/site-pages/about`
- FAQ editor:
  - load: `GET /api/admin/site-pages/faq`
  - save: `PATCH /api/admin/site-pages/faq`
- Mobile app modal editor:
  - load: `GET /api/admin/site-pages/mobile-app`
  - save: `PATCH /api/admin/site-pages/mobile-app`

### 10) Global Nav Enhancements (Loaded On Admin)
- Global search modal: `GET /api/search`
- Notifications menu:
  - `GET /api/notifications/unread-count`
  - `GET /api/notifications`
  - `POST /api/notifications/:id/read`
  - `POST /api/notifications/read-all`
- Mobile-app modal + admin-link nav behavior from shared nav scripts.

### 11) Session / Logout UX
- Nav avatar load: `GET /api/profile`
- Logout: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: admin route handling and middleware orchestration.
- `cookie-parser`: session-cookie parsing for authenticated admin access.
- `pg`: SQL access for logs, account controls, communities, content, and site pages.
- `mongodb`: main feed moderation datasets and account-linked content cleanup.
- `@google-cloud/storage`: signed URL resolution and object cleanup for deleted assets.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - DOM/event APIs
  - `window.confirm`, `window.prompt`
- Node/runtime:
  - Mongo `ObjectId` validation/mapping
  - storage-key normalization + signed URL helpers

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant):
  - `admin_audit_logs`
  - `accounts`
  - `profiles`
  - `communities`
  - `community_roles`
  - `community_memberships`
  - `community_reports`
  - `community_posts`
  - `community_comments`
  - `documents`
  - `site_page_content`
  - report-supporting tables (`user_profile_reports`, chat report tables)
- MongoDB collections (page-relevant):
  - `posts`
  - `post_comments`
  - `post_reports`
  - `post_likes`
  - `post_bookmarks`
  - AI/chat-related collections used during account cleanup
- Cloud object storage:
  - post attachments
  - library files/thumbnails
  - mobile app page assets (signed when needed)

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Tabbed workspace state:
  - maintains active main tab and active content-subtab with dynamic table schema switching.
- Source-specific content renderer:
  - maps each content subtab to dedicated endpoint + row/action templates.
- Community cache synchronization:
  - caches communities locally and syncs selected community editor state after updates.
- FAQ parser/formatter pipeline:
  - text-area lines parsed as `Question | Answer` pairs and normalized for save/load.
- Internal-link guard:
  - log target URLs are normalized to safe internal paths before rendering as links.

### Backend Algorithms
- Multi-source report aggregation:
  - collects report records from SQL + Mongo sources, normalizes status/source schema, applies unified filtering/sorting/pagination.
- Role/authority decision trees:
  - owner/admin privilege checks for role change, ban, delete, moderator assignment, and ownership transfer.
- Ownership transfer transaction:
  - token-confirmed owner handoff with transactional role swap (`owner` -> `admin`, target -> `owner`).
- Content moderation pipelines:
  - domain-specific delete/takedown actions with related cleanup (counts, linked records, storage assets).
- Account deletion cleanup cascade:
  - removes user-linked SQL identity, Mongo content, AI artifacts, and storage objects, then invalidates active sessions.
- Site-page normalization:
  - slug allowlist validation + per-slug body normalization with bounded field lengths.

## Security Measures In Place (Current)
- Access control:
  - `/admin` requires authenticated owner/admin web access (`requireAuth` + `requireOwnerOrAdmin`).
  - `/api/admin/*` endpoints require `requireAuthApi` and server-side owner/admin authorization guard.
  - banned accounts are denied admin API access.
- Privileged action constraints:
  - only owner can change roles or transfer ownership.
  - self-target restrictions prevent self-ban/self-delete/self-role-change misuse.
  - admins are restricted from banning/deleting higher-privileged accounts.
- Confirmation controls:
  - ownership transfer requires explicit transfer token (`TRANSFER`) in request payload.
- Input validation and bounds:
  - strict validation for IDs (including Mongo `ObjectId` checks), slugs, enums, and bounded text fields.
- Data-layer safety:
  - SQL queries use parameterized statements throughout admin APIs.
  - transaction use in ownership transfer and critical state mutations.
- Session security:
  - banned/deleted accounts have server sessions invalidated (`deleteSessionsForUid`).
- Content/storage safety:
  - content deletions include associated storage cleanup for non-external object keys.
  - storage cleanup uses normalized keys and guarded delete attempts.
- Site-page safety:
  - editable page slugs are allowlisted.
  - body payloads are normalized per page type before persistence.
- Audit readiness:
  - admin routes initialize audit logging service to support traceable governance actions.

