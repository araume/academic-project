# Rooms Page Documentation

## Scope
This document covers the Rooms page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/rooms.html`
- `src/styles/rooms.css`
- `src/styles/nav.css`
- `src/js/rooms.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/rooms.js`
- `server/services/roomsService.js`
- `server/services/communityService.js` (community bootstrap dependency for Rooms permissions/context)
- `server/routes/profile.js` (nav avatar endpoint)
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/routes/admin.js` (admin context + site-page content)
- `server/routes/auth.js` (logout endpoint)
- `server/services/storage.js`
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: Rooms workspace structure, context panels, room/request lists, search form, call panel, and room create/request modal.
- CSS3: responsive rooms dashboard layout, list cards, modal system, call iframe panel, and nav overlays.
- JavaScript (Browser): context-driven room loading, search/join flows, create/request modal logic, request review actions, embedded call lifecycle, and nav interactions.
- JavaScript (Node.js): authenticated room APIs for bootstrap/list/search/create/request/review/join/session/start/end/leave flows.
- SQL (PostgreSQL): rooms, requests, invites, participants, moderation events, memberships/roles, and blocked-user checks.
- MongoDB query language: global post search scope used by nav search on this page.

## Features Implemented On This Page

### 1) Authenticated Rooms Workspace
- Route is protected at `GET /rooms` with `requireAuth`.
- Main workspace includes:
  - course/public context selector
  - room list with filters
  - Meet ID search section
  - pending request queue (for reviewers)
  - right-side embedded call panel

### 2) Rooms Bootstrap and Contexts
- Bootstrap data source: `GET /api/rooms/bootstrap`
- Returns viewer capabilities, allowed communities, and pending-review count.
- Contexts are generated for:
  - Public rooms
  - Each accessible course community
- Create button dynamically switches between:
  - `Create room`
  - `Request room`

### 3) Room List and Filtering
- Room list endpoint: `GET /api/rooms`
- Supports filters:
  - context (`public` or `community`)
  - `communityId`
  - state (`scheduled`, `live`, `ended`, `canceled`)
  - mine-only toggle
- UI actions per room:
  - Join call
  - Start
  - End
  - waiting/unavailable status indicators

### 4) Meet ID Search and Quick Join
- Search endpoint: `GET /api/rooms/search?meetId=...`
- Search result card includes room metadata and contextual join/start action.
- Supports private-room join payload from:
  - typed password
  - invite token from URL query (`?room=...&invite=...`)

### 5) Direct Room Creation
- Direct create endpoint: `POST /api/rooms`
- Modal fields:
  - meet name
  - visibility (`public`, `course_exclusive`, `private`)
  - course context
  - optional private password
  - max participants
  - scheduled datetime
  - mic/video/screen-share participant permissions
- Private rooms return an invite link when created.
- After successful direct create, page immediately joins the room.

### 6) Room Request Workflow (Non-direct creators)
- Request endpoint: `POST /api/rooms/requests`
- Review list endpoint: `GET /api/rooms/requests`
- Reviewer actions:
  - approve request: `POST /api/rooms/requests/:id/approve`
  - reject request: `POST /api/rooms/requests/:id/reject`
- On approval, room is created from request payload and optional private invite link is generated.

### 7) Room Join and Session Lifecycle
- Join endpoint: `POST /api/rooms/:id/join`
- Session status endpoint: `GET /api/rooms/:id/session`
- Leave endpoint: `POST /api/rooms/:id/leave`
- Room state actions:
  - start: `POST /api/rooms/:id/start`
  - end: `POST /api/rooms/:id/end`
- Join response provides call link used in embedded iframe panel.

### 8) Embedded Call Panel
- In-page call panel loads room link in iframe.
- Also provides “Open in new tab” fallback link.
- Local heartbeat checks session state every 4 seconds and auto-closes the panel if:
  - room ends
  - participant is removed
  - access/session becomes invalid
- Handles postMessage leave events from the call origin for synchronized exit UX.

### 9) Pending Request Review Panel
- Visible only to moderators/admin/owner with review scope.
- Shows pending room requests with:
  - requester
  - visibility
  - capacity
  - expiry
- Approve/reject actions update lists and workspace state live.

### 10) Rooms Content Settings
- Course label text in modal is loaded from:
  - `GET /api/site-pages/rooms`
- Allows admin-configured content for Rooms page labels.

### 11) Global Nav Enhancements (Loaded On Rooms)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 12) Session / Logout UX
- Nav avatar fetch: `GET /api/profile`
- Logout action: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: Rooms and nav-supporting API routing.
- `cookie-parser`: session cookie parsing in authenticated request flows.
- `pg`: PostgreSQL access for rooms/requests/invites/participants/moderation/community checks.
- `@google-cloud/storage`: signed URL generation for profile photo links displayed in Rooms UI.
- `mongodb`: global search source used by nav search on this page.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - `URL`, `URLSearchParams`
  - `sessionStorage`
  - `setInterval`, `setTimeout`
  - `window.prompt`, `window.confirm`
  - `window.postMessage` event handling
  - DOM/event APIs
- Node built-ins:
  - `crypto` (random IDs/tokens, hashing, password verification)

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant):
  - `rooms`
  - `room_requests`
  - `room_invites`
  - `room_participants`
  - `room_moderation_events`
  - `community_memberships`
  - `community_roles`
  - `communities`
  - `accounts`
  - `profiles`
  - `blocked_users`
- MongoDB collections (nav search relevant): posts source for `/api/search`.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Context-driven workspace model:
  - state object binds selected context, room list, request list, search result, and current call session.
- Prejoin handoff algorithm:
  - consumes `sessionStorage` payload (`rooms-prejoin`) with timestamp-based TTL before auto-opening call panel.
- Meet ID normalization:
  - uppercase conversion and strict character filtering before search/join.
- Dynamic action rendering:
  - room cards/search results compute visible actions based on state and management privilege.
- Embedded call watchdog:
  - periodic session heartbeat (`/api/rooms/:id/session`) enforces live participation validity and exits stale sessions.
- Origin-validated call events:
  - iframe message handler only accepts events from expected call URL origin.
- Visibility-mode modal behavior:
  - password field and visibility options toggle based on creator capability and selected context.

### Backend Algorithms
- Unique Meet ID generator:
  - random 8-char ID from constrained alphabet with collision check loop (bounded attempts).
- Room state derivation:
  - auto-computes initial state (`scheduled` vs `live`) from scheduled timestamp threshold.
- Direct-create vs request decision model:
  - evaluates role + visibility + community moderator status to route users into direct creation or moderated request flow.
- Request expiry sweep:
  - periodic pending-request expiration update throttled per process.
- Private invite token model:
  - raw token generation, SHA-256 digest storage, expiry and revocation checks.
- Private room password model:
  - `scrypt` hash format (`scrypt$salt$hash`) with timing-safe verification.
- Join authorization decision tree:
  - block-list check -> visibility-specific policy (public/course/private) -> invite/password validation -> room-state gate -> capacity check -> participant upsert.
- Moderation workflow state machine:
  - request statuses (`pending/approved/rejected/expired`) and room states (`scheduled/live/ended/canceled`) enforced with explicit transitions and checks.

## Security Measures In Place (Current)
- Access control:
  - `/rooms` page requires `requireAuth`.
  - `/api/rooms` endpoints require `requireAuthApi`.
  - nav-linked endpoints used here (`/api/profile`, `/api/search`, `/api/notifications`, `/api/admin/me`, `/api/site-pages/:slug`) are authenticated.
- Rate limiting:
  - per-user action buckets protect room create/request/approve/reject/join/leave/start/end flows.
- Role and scope authorization:
  - room creation, request review, start/end actions, and join permissions are enforced server-side by owner/admin/moderator/membership rules.
- Visibility and access enforcement:
  - public/course-exclusive/private visibility policies are validated on list/search/join/session endpoints.
  - course-exclusive access checks include course matching and membership/moderator verification.
- Block safety:
  - bidirectional `blocked_users` checks prevent room visibility and join access between blocked pairs.
- Private room protections:
  - invite tokens are stored/validated as SHA-256 digests with expiry/revocation checks.
  - optional room passwords are stored as salted `scrypt` hashes and verified with `timingSafeEqual`.
- Input validation and bounds:
  - room/request IDs validated as positive integers.
  - strict Meet ID format checks on search.
  - visibility/state enums constrained.
  - participant limit and schedule-time bounds enforced.
  - password length requirements enforced for private rooms.
- Capacity and participant state controls:
  - join flow enforces max participant limit and rejects non-managers previously marked `kicked`.
- Transactional consistency:
  - critical write paths use `BEGIN/COMMIT/ROLLBACK` (create room, approve request, join, end room).
  - request approval uses row locking (`FOR UPDATE`) to prevent concurrent double-review.
- Data access safety:
  - SQL operations use parameterized queries throughout room APIs.
- Session integrity in call UI:
  - frontend heartbeat continuously validates session state; stale/ended/unauthorized calls are closed locally.
  - iframe event handling validates message origin before acting on leave events.
