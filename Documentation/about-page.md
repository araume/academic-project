# About Page Documentation

## Scope
This document covers the About page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/about.html`
- `src/styles/site-pages.css`
- `src/styles/nav.css`
- `src/js/site-page.js`
- `src/js/nav-basic.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/admin.js` (site-page content API)
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: About page shell and nav structure.
- CSS3: shared site-page layout and content card styling.
- JavaScript (Browser): dynamic About content rendering and nav behaviors.
- JavaScript (Node.js): authenticated site-page API and content normalization.
- SQL (PostgreSQL): site-page content persistence/retrieval.

## Features Implemented On This Page

### 1) Authenticated About Page
- Route is protected at `GET /about` with `requireAuth`.
- Uses shared site-page container (`sitePageRoot`) and dynamic rendering.

### 2) Dynamic About Content Loading
- Content endpoint: `GET /api/site-pages/about`
- Renders sections:
  - hero/title/subtitle
  - overview
  - highlights list
  - commitments list
  - optional contact email link (`mailto:`)
- Includes loading and error fallback states.

### 3) Shared Site-Page Renderer
- Page mode is derived from `data-page-slug="about"`.
- Reuses site-page rendering utilities used by FAQ.

### 4) Global Nav Enhancements (Loaded On About)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 5) Session / Logout UX
- Logout: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: page/API routing and middleware.
- `cookie-parser`: authenticated session-cookie parsing.
- `pg`: DB access for site page records.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - DOM/event APIs

### Storage / Data Systems Used
- PostgreSQL table (page-relevant): `site_page_content`.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Slug-driven page branch:
  - renderer checks page slug and selects About-rendering path.
- List rendering logic:
  - highlights/commitments arrays render as chip lists with configured fallbacks.
- Progressive state rendering:
  - loading -> content -> error-state fallback.

### Backend Algorithms
- About-body normalization:
  - sanitizes/limits overview text, highlights, commitments, and contact email.
- Default-value resolution:
  - if DB record is missing/incomplete, normalized default About content is returned.
- Slug allowlist control:
  - API only serves approved site-page slugs.

## Security Measures In Place (Current)
- Access control:
  - `/about` requires `requireAuth`.
  - `/api/site-pages/:slug` requires `requireAuthApi`.
- Input and slug constraints:
  - slug is validated against allowlisted values.
  - About body fields are normalized and length-bounded server-side.
- Output safety:
  - rendered text uses DOM text APIs, avoiding raw HTML injection from page content payloads.
- Data-layer safety:
  - SQL queries use parameterized values.
- Session integrity:
  - nav/logout/search/notification actions are authenticated and user-scoped.

