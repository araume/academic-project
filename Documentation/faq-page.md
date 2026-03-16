# FAQ Page Documentation

## Scope
This document covers the FAQ page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/faq.html`
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
- HTML5: FAQ page shell and nav structure.
- CSS3: static site-page hero/content styling and responsive behavior.
- JavaScript (Browser): dynamic page-content fetch/render flow and nav interactions.
- JavaScript (Node.js): authenticated site-page content retrieval and normalization.
- SQL (PostgreSQL): persisted site-page content retrieval (`site_page_content`).

## Features Implemented On This Page

### 1) Authenticated FAQ Page
- Route is protected at `GET /faq` with `requireAuth`.
- Uses a shared site-page shell (`sitePageRoot`) populated dynamically.

### 2) Dynamic FAQ Content Loading
- Content endpoint: `GET /api/site-pages/faq`
- Renders:
  - hero section (title/subtitle)
  - FAQ list (`question` + `answer`) in expandable `<details>` items
- Includes loading, empty, and error states.

### 3) Shared Site-Page Rendering System
- Page identity is derived from `data-page-slug="faq"`.
- Shared renderer (`site-page.js`) selects FAQ-specific view logic.

### 4) Global Nav Enhancements (Loaded On FAQ)
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
- `express`: site-page and nav-supporting route handling.
- `cookie-parser`: session cookie parsing for authenticated page/API access.
- `pg`: site-page content storage/retrieval.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - DOM/event APIs

### Storage / Data Systems Used
- PostgreSQL table (page-relevant): `site_page_content` (slug-based content records).

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Slug-based renderer selection:
  - `site-page.js` reads body slug and chooses FAQ rendering branch.
- Declarative FAQ item rendering:
  - iterates normalized `items[]` and generates semantic `<details>/<summary>` blocks.
- Robust loading lifecycle:
  - loading placeholder -> success content or error-state fallback.

### Backend Algorithms
- Site-page slug normalization:
  - slug allowlist validation before query execution.
- Content normalization:
  - FAQ body sanitization enforces item structure (`question` + `answer`), size limits, and max item count.
- Default-content fallback:
  - returns predefined FAQ content when no DB row exists.

## Security Measures In Place (Current)
- Access control:
  - `/faq` requires `requireAuth`.
  - `/api/site-pages/:slug` requires `requireAuthApi`.
- Endpoint hardening:
  - slug is validated against an allowlist (`about`, `faq`, `rooms`, `mobile-app`).
- Output safety:
  - FAQ content is rendered via DOM text nodes (`textContent`) instead of raw HTML injection.
- Data-layer safety:
  - site-page SQL queries use parameterized inputs.
- Session protection:
  - authenticated nav/logout/search/notification flows are session-scoped.

