# Community Page Documentation

## Scope
This document covers the Community page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/community.html`
- `src/styles/community.css`
- `src/styles/nav.css`
- `src/js/community.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/community.js`
- `server/services/communityService.js`
- `server/routes/library.js` (Open Library picker/detail source)
- `server/routes/profile.js` (nav avatar endpoint)
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/routes/admin.js` (admin context + mobile-app page content)
- `server/routes/auth.js` (logout endpoint)
- `server/services/storage.js`
- `server/services/notificationService.js`
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: Community workspace layout, feed area, modals (rules/comments/create post/library picker/moderation/member directory), and nav shell.
- CSS3: responsive two-pane page styling, feed cards, moderation panels, modal systems, and nav overlay styling.
- JavaScript (Browser): stateful community selection, feed rendering, post/comment/moderation actions, rules acceptance flow, and nav search/notifications/profile-menu logic.
- JavaScript (Node.js): authenticated community APIs, moderation/reporting endpoints, membership/rules enforcement, and nav-supporting APIs.
- SQL (PostgreSQL): communities, memberships, rules, posts, likes, comments, reports, roles, warnings/bans, profile/account joins, and document visibility checks for library attachments.
- MongoDB query language: global post search scope used by nav search on this page.

## Features Implemented On This Page

### 1) Authenticated Community Workspace
- Route is protected at `GET /community` with `requireAuth`.
- Main layout includes:
  - community list/search panel
  - selected community workspace
  - feed area with refresh
  - member stats and membership status

### 2) Community Discovery and Selection
- Bootstrap payload loads viewer + community roster: `GET /api/community/bootstrap`
- Community details load on selection: `GET /api/community/:id`
- Community list supports client-side search by course name/code.
- Feed-focus mode is available for focused reading on smaller layouts.

### 3) Membership and Rule Acceptance Flows
- Membership actions:
  - join/request: `POST /api/community/:id/join`
  - leave/cancel request: `POST /api/community/:id/leave`
- Rules retrieval and acceptance:
  - get rules: `GET /api/community/:id/rules`
  - accept latest rules: `POST /api/community/:id/rules/accept`
- Main-course communities auto-keep membership and cannot be left from this page.

### 4) Community Feed and Post Rendering
- Feed retrieval with paging: `GET /api/community/:id/feed?page=1&pageSize=24`
- Post cards render:
  - author profile link/avatar
  - relative time
  - visibility tag (`community` or `main_course_only`)
  - attachment preview (image/video/library document)
  - likes/comments/action controls

### 5) Community Post Creation and Management
- Create post: `POST /api/community/:id/posts` (multipart form)
- Supports optional attachment:
  - uploaded image/video
  - Open Library document attachment
- Edit post: `PATCH /api/community/:id/posts/:postId`
- Delete post: `DELETE /api/community/:id/posts/:postId`
- Moderator takedown: `POST /api/community/:id/posts/:postId/takedown`

### 6) Post Interactions and Reporting
- Like/unlike post: `POST /api/community/:id/posts/:postId/like`
- Report post/member/moderator/comment target: `POST /api/community/:id/reports`
- Feed/interaction paths respect membership and rules-acceptance state.

### 7) Comments Workflow
- List comments: `GET /api/community/:id/posts/:postId/comments`
- Create comment: `POST /api/community/:id/posts/:postId/comments`
- Edit comment: `PATCH /api/community/:id/comments/:commentId`
- Delete comment: `DELETE /api/community/:id/comments/:commentId`
- Moderator takedown: `POST /api/community/:id/comments/:commentId/takedown`
- Comment reporting uses community report pipeline with `targetType=comment`.

### 8) Moderator Tools Workspace
- Moderator modal includes:
  - rules editor (publish new versions)
  - join request queue
  - member management (warn/ban/unban)
  - report review and resolution actions
- Moderation APIs:
  - pending requests: `GET /api/community/:id/join-requests`
  - decide request: `POST /api/community/:id/join-requests/:uid`
  - members list: `GET /api/community/:id/members`
  - warn: `POST /api/community/:id/members/:uid/warn`
  - ban: `POST /api/community/:id/members/:uid/ban`
  - unban: `POST /api/community/:id/members/:uid/unban`
  - reports: `GET /api/community/:id/reports`
  - resolve report: `POST /api/community/:id/reports/:reportId/resolve`
  - publish rules: `POST /api/community/:id/rules`

### 9) Open Library Attachment Picker Integration
- Document picker in compose modal loads accessible docs from:
  - `GET /api/library/documents`
- Selected document is attached by UUID during post submit.
- Document open action resolves signed detail link via:
  - `GET /api/library/documents/:uuid`

### 10) Global Nav Enhancements (Loaded On Community)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 11) Session / Logout UX
- Nav avatar/profile metadata fetch: `GET /api/profile`
- Logout flow: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: community and nav-supporting route handling.
- `cookie-parser`: session cookie parsing used by authenticated middleware flows.
- `pg`: PostgreSQL connectivity for community data, moderation, rules, and visibility checks.
- `multer`: multipart upload parsing for community post attachments with memory storage and size cap.
- `@google-cloud/storage`: community media upload/delete and signed URL generation.
- `mongodb`: global post-search scope (`/api/search`) used by nav search modal.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - `FormData`
  - `URLSearchParams`
  - `setTimeout` (search debounces)
  - `window.open`, `window.prompt`, `window.confirm`
  - DOM/event APIs
- Node/runtime utilities:
  - in-memory `Map` buckets for per-user rate limits in community routes
  - `path` in server page routing layer

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant):
  - `communities`
  - `community_memberships`
  - `community_roles`
  - `community_rules`
  - `community_rule_acceptances`
  - `community_posts`
  - `community_post_likes`
  - `community_comments`
  - `community_reports`
  - `community_post_reports`
  - `community_comment_reports`
  - `community_warnings`
  - `community_bans`
  - `accounts`
  - `profiles`
  - `documents` (library attachment validation)
- MongoDB collections (nav search relevant): post search source used by `/api/search`.
- Cloud object storage for post attachments/profile assets with signed access links.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Stateful community workspace model:
  - central `state` object tracks viewer, selected community/detail, feed data, moderation data, and modal context.
- Community filtering:
  - local search matcher combines course name + code and applies case-insensitive `includes`.
- Debounced queries:
  - Open Library picker search debounce (~250ms).
  - member directory search debounce (~220ms).
- Rules-gated continuation flow:
  - `pendingRuleAction` callback stores blocked action and resumes it after successful rules acceptance.
- Attachment-source exclusivity:
  - create-post flow enforces one source only (uploaded file OR Open Library document).
- Dynamic UI permission rendering:
  - owner/moderator actions are conditionally rendered (edit/delete/takedown/discipline/report actions).
- Relative-time formatter:
  - compact `m/h/d ago` display for posts, comments, requests, and reports.

### Backend Algorithms
- Community bootstrap orchestration (`bootstrapCommunityForUser`):
  - ensures schema/index readiness, syncs communities from courses, seeds platform roles (env-driven), and guarantees main-course membership state.
- Access matrix evaluator (`getCommunityAccess`):
  - computes `canReadFeed`, `canPost`, `canModerate`, and `requiresRuleAcceptance` from membership state, role hierarchy, and latest-rule acceptance.
- In-memory per-user rate limiting:
  - action-specific buckets keyed by `uid:action` inside a fixed window.
- Feed visibility filter construction:
  - SQL conditions vary by moderator capability and viewer main-course membership (including `main_course_only` gating).
- Attachment ingestion decision tree:
  - validates and processes upload media vs. library-doc attachment vs. link attachment with strict branch handling.
- Idempotent like/unlike counters:
  - conflict-safe like insert/delete with bounded count decrement (`GREATEST(..., 0)`).
- Moderation discipline hierarchy:
  - `canDisciplineTarget` prevents self-discipline and enforces owner/admin/moderator/member precedence constraints.
- Report resolution state machine:
  - controlled status transitions plus optional moderator actions (`warn/suspend/ban`) with role-gated execution.

## Security Measures In Place (Current)
- Access control:
  - `/community` page requires `requireAuth`.
  - `/api/community` endpoints are protected by `requireAuthApi`.
  - nav endpoints used here (`/api/search`, `/api/notifications`, `/api/admin/me`, `/api/site-pages/:slug`, `/api/profile`) are authenticated.
- Session protection:
  - server-side session model with authenticated user context for all community operations.
- Membership/rules authorization:
  - feed/post/comment/like interactions are gated by membership state and latest-rules acceptance checks.
- Role-based moderation controls:
  - moderator/admin/owner checks are enforced server-side for rules publishing, request decisions, takedowns, discipline, and report resolution.
  - moderator-target report actions are restricted to owner/admin reviewer roles.
- Rate limiting:
  - per-user action buckets enforce request ceilings on join/leave, posting, commenting, likes, moderation, and report actions.
- Input validation and sanitization:
  - route IDs validated as positive integers.
  - text payloads normalized and length-bounded via server sanitization.
  - enum-like fields (status/action/targetType/visibility) are explicitly constrained.
- Upload safety controls:
  - multipart upload size cap at 50MB with dedicated `LIMIT_FILE_SIZE` handling (`413`).
  - file-type gating allows image/video uploads only for file attachments.
- Resource existence/ownership checks:
  - post/comment/report/target entities are validated before mutation.
  - owner-or-moderator authorization is required for edit/delete/takedown operations.
- Visibility-safe document attachment checks:
  - attached Open Library document UUID must resolve to a document visible to the acting user.
- Storage access protection:
  - profile and attachment media links are signed with TTL before delivery.
  - storage object delete operations are constrained to eligible owned/moderated attachment keys.
- Data layer safety:
  - SQL operations use parameterized queries across community routes/services.
- Frontend nav safety guards:
  - notification/search rendering escapes dynamic HTML content.
  - target URL normalization restricts notification navigation to internal paths.
