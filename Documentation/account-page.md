# Account Page Documentation

## Scope
This document covers the Account page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/account.html`
- `src/styles/account.css`
- `src/styles/nav.css`
- `src/js/account.js`
- `src/js/nav-basic.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/auth.js` (account settings APIs)
- `server/routes/profile.js` (nav avatar endpoint used by `nav-basic.js`)
- `server/routes/admin.js` (admin context + nav site-page/mobile-app content)
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/auth/password.js`
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: account settings forms and status sections.
- CSS3: account settings layout, card/form styling, and status badges.
- JavaScript (Browser): account data bootstrap, form validation, and account-update API interactions.
- JavaScript (Node.js): account-setting APIs, email verification token handling, and credential updates.
- SQL (PostgreSQL): account row retrieval/updates, email uniqueness checks, and token persistence.

## Features Implemented On This Page

### 1) Authenticated Account Settings Workspace
- Route is protected at `GET /account` with `requireAuth`.
- Sections include:
  - account summary (email, verification status, recovery email)
  - username update
  - primary email update
  - password update
  - recovery email update

### 2) Account Data Bootstrap
- Load endpoint: `GET /api/account`
- Populates:
  - username
  - current email
  - recovery email
  - email verification status

### 3) Username Management
- Update endpoint: `PATCH /api/account/username`
- Enforces username format/length constraints and uniqueness.

### 4) Primary Email Update
- Update endpoint: `PATCH /api/account/email`
- Requires current password confirmation.
- Triggers re-verification workflow and displays verification status update.
- Supports dev verification-link display when available.

### 5) Password Update
- Update endpoint: `PATCH /api/account/password`
- Requires:
  - current password
  - new password + confirmation

### 6) Recovery Email Management
- Update endpoint: `PATCH /api/account/recovery-email`
- Requires current password.
- Allows set/update/remove (blank value removes).

### 7) Global Nav Enhancements (Loaded On Account)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count: `GET /api/notifications/unread-count`
  - list: `GET /api/notifications`
  - mark one read: `POST /api/notifications/:id/read`
  - mark all read: `POST /api/notifications/read-all`

### 8) Session / Logout UX
- Logout: `POST /api/logout`, then redirect to `/login`

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: account/auth route handling.
- `cookie-parser`: cookie session parsing for authenticated web/API flows.
- `pg`: account data queries and updates.
- `nodemailer`: verification email dispatch after primary-email change.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - DOM/event APIs
- Node built-ins:
  - `crypto` (verification token generation/digesting in auth flows)

### Storage / Data Systems Used
- PostgreSQL tables (page-relevant): `accounts`, `email_verification_tokens`, `auth_schema_meta`.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Form-specific handlers:
  - separate async submit paths for username/email/password/recovery forms.
- Client-side guard checks:
  - required field checks
  - password confirmation match check
- Verification-link UX:
  - conditionally shows dev verification link when provided by API.

### Backend Algorithms
- Username validation pipeline:
  - trims input, length bounds, regex allowlist, uniqueness conflict handling.
- Email-change transaction flow:
  - locks current account row (`FOR UPDATE`),
  - verifies current password,
  - checks duplicate email,
  - updates email + resets verification fields,
  - issues new verification token.
- Password update path:
  - verifies current password hash before writing new hash.
- Recovery email update path:
  - requires password check and validates optional email format.

## Security Measures In Place (Current)
- Access control:
  - `/account` page requires `requireAuth`.
  - `/api/account/*` endpoints require `requireAuthApi`.
- Re-authentication controls:
  - current password is required for email, password, and recovery-email changes.
- Input validation:
  - username format/length enforcement.
  - email format validation.
  - password length and password-difference checks.
- Email ownership protection:
  - primary email uniqueness is enforced before update.
  - email change resets `email_verified` and requires new verification.
- Token security:
  - verification tokens are stored as SHA-256 digests and validated via token flow.
- Password security:
  - password updates use hash-based storage/verification (`hashPassword`, `verifyPassword`).
- Data-layer safety:
  - SQL operations use parameterized queries.
  - critical email-change flow uses transaction + row lock.
- Session integrity:
  - account APIs rely on authenticated session identity from server-side session middleware.

