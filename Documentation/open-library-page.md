# Open Library Page Documentation

## Scope
This document covers the Open Library page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/open-library.html`
- `src/styles/library.css`
- `src/styles/nav.css`
- `src/js/library.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/library.js`
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
- HTML5: page layout, controls, cards, detail modal, upload modal, uploader filter modal, and document AI modal.
- CSS3: responsive page styling, card grid, modal systems, discussion/chat visuals, and nav overlay support.
- JavaScript (Browser): filtering/search/pagination state, modal flows, upload/edit/delete/comment/like actions, document AI chat UX.
- JavaScript (Node.js): Open Library APIs for document listing, upload lifecycle, metadata updates, comments, likes, and AI endpoints.
- SQL (PostgreSQL): documents/courses/likes/profile joins, ownership checks, popularity/views updates, visibility filtering.
- MongoDB query language: document comments and per-user document AI conversation/message persistence.

## Features Implemented On This Page

### 1) Authenticated Open Library Workspace
- Route is protected at `GET /open-library` with `requireAuth`.
- Main sections:
  - header + upload entry point
  - search/sort/filter controls
  - document grid
  - pagination controls

### 2) Document Discovery and Filtering
- Search by title/subject query.
- Filters:
  - course filter
  - sort (`recent`, `oldest`, `popularity`, `views`, `az`, `za`)
  - uploader filter (modal-based picker)
- Document list API:
  - `GET /api/library/documents`
- Uploader filter source:
  - `GET /api/library/uploaders`

### 3) Document Detail and Discussion
- Detail modal presents metadata, availability, and actions.
- Document detail fetch API:
  - `GET /api/library/documents/:uuid`
- Discussion comments:
  - list `GET /api/library/comments?documentUuid=...`
  - create `POST /api/library/comments`

### 4) Upload and Management
- Upload modal with:
  - title/description
  - file (required)
  - optional thumbnail
  - course + subject
  - visibility toggle (public/private)
  - AI allowed toggle
- Upload API:
  - `POST /api/library/documents`
- Owner-only management:
  - edit metadata `PATCH /api/library/documents/:uuid`
  - delete document `DELETE /api/library/documents/:uuid`

### 5) Engagement Features
- Like/unlike:
  - `POST /api/library/like`
- View count update on open:
  - `POST /api/library/documents/:uuid/view`
- Share link action:
  - clipboard copy with prompt fallback.

### 6) Ask AI About Document
- AI bootstrap:
  - `GET /api/library/documents/:uuid/ask-ai/bootstrap`
- Send message:
  - `POST /api/library/documents/:uuid/ask-ai/messages`
- AI chat is document-scoped and per-user, with retained message history.
- Uses document metadata + extracted context excerpt where available.

### 7) Course Option Loading
- Upload form and course filter options are populated from:
  - `GET /api/library/courses`

### 8) Global Nav Enhancements (Loaded On Open Library)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count (`GET /api/notifications/unread-count`)
  - list (`GET /api/notifications`)
  - mark one read (`POST /api/notifications/:id/read`)
  - mark all read (`POST /api/notifications/read-all`)

### 9) Session / Logout UX
- Nav avatar fetch:
  - `GET /api/profile`
- Logout:
  - `POST /api/logout`, then redirect to `/login`.

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: route and middleware handling.
- `cookie-parser`: cookie session parsing.
- `pg`: PostgreSQL query execution for library metadata/filters/interactions.
- `mongodb`: comments and document-AI conversation/message storage.
- `multer`: multipart upload parsing with file size limit.
- `@google-cloud/storage`: object upload/download/delete and signed URL generation.
- `openai`: document AI conversation response generation and OCR extraction fallback.
- `pdf-parse`: PDF text extraction for document context.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - `FormData`
  - `URLSearchParams`
  - `navigator.clipboard`
  - DOM/event APIs
- Node built-ins:
  - `crypto` (UUID generation)
  - `path` (file extension classification)
  - `zlib` (ZIP inflate for DOCX/PPTX parsing)

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant): `documents`, `courses`, `document_likes`, `accounts`, `profiles`.
- MongoDB collections (page-relevant): `doccomment`, `library_ai_conversations`, `library_ai_messages`.
- Cloud object storage:
  - document files
  - thumbnails
  - context retrieval and signed delivery

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Query-state driven document fetch:
  - central `state` object controls page, query, course, uploader, sort, and pagination.
- Pagination algorithm:
  - computes total pages from `total/pageSize` and enables/disables next/prev accordingly.
- Active-user refresh loop:
  - polls every 10 seconds and refreshes list only when user activity is recent (<30s).
- Uploader filter workflow:
  - modal search -> selectable uploader rows -> persisted filter chip -> clear action.
- Availability gating:
  - disables Open/View action when signed document link is unavailable.
- Owner-aware detail controls:
  - edit/delete shown only for owner; report shown for non-owner.
- Document AI modal lifecycle:
  - bootstrap context + history on open, pending assistant bubble during message send, graceful failure fallback.

### Backend Algorithms
- Visibility/access filtering:
  - applies public/private/course/owner/admin visibility logic for list/detail and AI access.
- Search matching strategy:
  - tokenizes search text and uses escaped PostgreSQL regex word-boundary matching on title/subject.
- Sort mapping:
  - maps sort options to explicit SQL `ORDER BY` strategies.
- Signed URL strategy:
  - normalizes storage keys, checks object existence when configured, signs links/thumbnails with TTL.
- Upload pipeline:
  - stores file and optional thumbnail in object storage, then inserts document metadata row.
- Like/unlike algorithm:
  - idempotent insert/delete in `document_likes`, popularity increment/decrement with floor clamp.
- AI context extraction cascade:
  - text/markdown direct parse
  - PDF parse with OCR fallback via OpenAI if extracted text is too short
  - DOCX/PPTX unzip + XML text extraction
  - excerpt truncation to bounded length
- Document AI conversation model:
  - conversation keyed by `(userUid, documentUuid)` with persisted messages and context excerpt reuse.
- Notification trigger logic:
  - on like/comment, creates notifications for uploader when actor is different and not blocked.

## Security Measures In Place (Current)
- Access control:
  - `/open-library` is protected by `requireAuth`.
  - `/api/library` routes are protected by `requireAuthApi`.
  - nav-linked routes used on this page (`/api/profile`, `/api/search`, `/api/notifications`, `/api/admin/me`, `/api/site-pages/:slug`) are authenticated.
- Session protection:
  - server-managed sessions with expiry and validated cookie/bearer session lookup.
- Visibility and authorization enforcement:
  - list/detail/AI access enforce document visibility rules against user course/ownership/admin privileges.
  - edit/delete endpoints enforce owner-only authorization.
- Upload safety controls:
  - multipart upload size cap (50MB) with explicit `LIMIT_FILE_SIZE` handling (`413`).
- Input validation and bounds:
  - required-field checks for uploads/comments/messages.
  - bounded `page/pageSize` parsing and controlled sort values.
- Storage access protection:
  - document and thumbnail links are returned as signed URLs with TTL.
  - unavailable storage objects are safely treated as non-openable.
- Data layer safety:
  - SQL operations use parameterized queries.
  - action logic checks document existence before mutations.
- AI access controls:
  - AI endpoints require accessible document and respect uploader `aiallowed` setting.
  - context extraction has strict size limits before heavy parsing/OCR.
- Notification/privacy safeguards:
  - block-relationship checks before issuing like/comment notifications.
- Frontend external navigation safety:
  - document open uses `window.open(..., 'noopener,noreferrer')`.
