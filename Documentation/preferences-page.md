# Preferences Page Documentation

## Scope
This document covers the Preferences page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/preferences.html`
- `src/styles/preferences.css`
- `src/styles/nav.css`
- `src/js/preferences.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/connections.js` (privacy/preferences APIs)
- `server/routes/profile.js` (avatar data source used in nav flows)
- `server/routes/admin.js` (admin context + nav site-page/mobile-app content)
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/routes/auth.js` (logout endpoint)
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: preference controls, notification toggles, and policy selector form.
- CSS3: settings-card layout, toggle rows, and responsive presentation.
- JavaScript (Browser): preferences bootstrap/load/save logic and nav interactions.
- JavaScript (Node.js): privacy settings API validation and updates.
- SQL (PostgreSQL): user privacy settings and related preference state.

## Features Implemented On This Page

### 1) Authenticated Preferences Workspace
- Route is protected at `GET /preferences` with `requireAuth`.
- Settings categories include:
  - privacy discoverability controls
  - presence visibility control
  - notification preference toggles
  - non-follower chat policy

### 2) Privacy Settings Bootstrap
- Viewer bootstrap (for nav avatar): `GET /api/connections/bootstrap`
- Privacy settings load: `GET /api/preferences/privacy`
- Initializes form from persisted user settings.

### 3) Privacy and Notification Preference Updates
- Save endpoint: `PATCH /api/preferences/privacy`
- Supports updates for:
  - `searchable`
  - `follow_approval_required`
  - `active_visible`
  - `notify_new_posts_from_following`
  - `notify_post_activity`
  - `notify_document_activity`
  - `non_follower_chat_policy` (`allow` | `request` | `deny`)

### 4) Blocked Users Navigation
- Preferences page links to blocked-users management route:
  - `/preferences/blocked-users`

### 5) Global Nav Enhancements (Loaded On Preferences)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 6) Session / Logout UX
- Logout: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: preferences and connections API routing.
- `cookie-parser`: cookie-backed authenticated request parsing.
- `pg`: privacy settings persistence and retrieval.
- `mongodb`: nav search backend source (`/api/search`) used by this page’s nav modal.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - DOM/event APIs

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant): `user_privacy_settings`, `accounts`, `profiles` and related preference-support tables in connections service.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Form-to-payload mapping:
  - maps checkboxes/select values into strongly-typed boolean/enum payload fields.
- Bootstrap sequence:
  - loads viewer/nav context first, then privacy settings state.
- Message feedback flow:
  - unified success/error message renderer after save attempts.

### Backend Algorithms
- Allowed-policy validation:
  - non-follower chat policy constrained to `allow/request/deny`.
- Typed update builder:
  - accepts only supported boolean/enum fields and rejects invalid types.
- User-scoped partial update:
  - updates only provided fields and keeps other settings unchanged.
- Middleware bootstrap:
  - ensures connections/privacy schema readiness and updates user presence timestamp for authenticated requests.

## Security Measures In Place (Current)
- Access control:
  - `/preferences` requires `requireAuth`.
  - `/api/preferences/*` endpoints require `requireAuthApi`.
- Input validation:
  - strict boolean validation for toggle fields.
  - strict enum validation for `non_follower_chat_policy`.
  - rejects empty/invalid update payloads.
- User scoping:
  - preferences are updated only for the authenticated user UID.
- Data-layer safety:
  - SQL statements use parameterized queries.
- Session integrity:
  - all preference and nav actions are authenticated against server-side session identity.
- Route-level protections:
  - blocked-users management route linked from this page is also auth-protected.

