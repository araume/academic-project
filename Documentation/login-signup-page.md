# Login / Signup Page Documentation

## Scope
This document covers the Login/Signup page implementation, including:
- Login
- Signup
- Email verification resend
- Forgot password (request code, verify code, reset password)
- Related backend authentication/session behaviors used directly by this page

Primary files:
- `src/login.html`
- `src/js/login.js`
- `src/styles/login.css`
- `server/routes/auth.js`
- `server/auth/password.js`
- `server/auth/sessionStore.js`
- `server/services/emailService.js`

## Programming Languages Used
- HTML5: page layout, forms, modal structure.
- CSS3: responsive layout, modal UI, animation, styling system.
- JavaScript (Browser): form handling, modal state management, API calls, UX flow logic.
- JavaScript (Node.js): authentication APIs, token/session workflows, email dispatch, schema bootstrap.
- SQL (PostgreSQL): user lookup, account creation, verification/password reset/session persistence.

## Features Implemented On This Page

### 1) Login
- Email + password login form with browser autocomplete attributes.
- Client sends `POST /api/login` with JSON payload.
- On success, user is redirected to `/home`.
- If login fails due to unverified email, page shows a targeted message and reveals the resend verification action.

### 2) Signup (Modal)
- Signup modal with fields:
  - Email
  - Password
  - Username
  - Display name
  - Course
  - Recovery email
- Client sends `POST /api/signup`.
- Course list is dynamically loaded from `assets/course-list.txt`.
- On successful signup, login panel shows verification guidance.

### 3) Email Verification Handling
- Resend verification button triggers `POST /api/verification/resend`.
- Verification status is read from query param (`verified`) on page load and displayed to user:
  - `success`, `expired`, `already`, `invalid`, `error`
- URL cleanup is performed with `history.replaceState` after displaying status.

### 4) Forgot Password (Three-Step Flow)
- Step 1: Request reset code via `POST /api/password-reset/request`.
- Step 2: Verify code via `POST /api/password-reset/verify`.
- Step 3: Complete password reset via `POST /api/password-reset/complete`.
- Modal state transitions are handled client-side with explicit step control (`request`, `verify`, `reset`).

### 5) Modal and UX Utilities
- Signup and forgot-password modals support:
  - Open/close buttons
  - Back actions
  - Outside-click close
  - `Escape` key close
- Password visibility toggles for login and signup password fields.
- Inline status messaging for success/error states.

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: API routing and request handling.
- `pg`: PostgreSQL connectivity and parameterized queries.
- `cookie-parser`: cookie parsing for session retrieval.
- `nodemailer`: SMTP/log-mode verification and password reset emails.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - `FormData`
  - `URLSearchParams`
  - `history.replaceState`
  - DOM/Event APIs
- Node built-ins:
  - `crypto` (random token/code generation, hashing)

### Supporting Services / Data Layer
- PostgreSQL tables used in this flow:
  - `accounts`
  - `email_verification_tokens`
  - `password_reset_codes`
  - `auth_sessions`
  - `auth_schema_meta`
- Email service modes:
  - SMTP mode
  - Log mode (for development/testing workflows)

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Forgot-password finite-step flow:
  - State variable controls one of three explicit steps.
  - UI sections/buttons are toggled based on current step.
- Reset code normalization:
  - Removes whitespace and forces uppercase before verification.
- Course option builder:
  - Parse line-delimited text, trim/filter comments/blanks, de-duplicate using `Set`, sort lexicographically.
- API response parser:
  - If JSON content-type, parse JSON.
  - Otherwise parse text with controlled truncation for error display.

### Backend Algorithms
- Password hashing:
  - `scrypt` with per-password random salt.
- Password verification:
  - Re-derive hash and compare with `timingSafeEqual`.
- Verification token generation:
  - Random 32-byte token encoded for URL-safe transport.
  - SHA-256 digest persisted instead of raw token.
- Password reset code generation:
  - 6-character random code from constrained alphabet.
- Password reset protection logic:
  - Cooldown timer between code sends.
  - Attempt counter with max-attempt lock behavior.
  - Time-based expiry checks on code and reset token.
- Session lifecycle:
  - Random 24-byte session IDs.
  - Persistent TTL-based session expiry.
  - Periodic cleanup of expired session records.

## Security Measures In Place (Current)
- Passwords are stored as salted `scrypt` hashes.
- Password verification uses constant-time comparison (`timingSafeEqual`).
- Session cookie is `httpOnly`, `sameSite=lax`, and `secure` in production.
- Sessions are server-side (DB-backed), with explicit expiration and cleanup.
- Email verification requires token-based proof before login is allowed.
- Verification tokens are stored as SHA-256 digests (not raw tokens).
- Password reset codes and reset tokens are stored as digests and validated with expiry.
- Password reset enforces:
  - code TTL
  - request cooldown
  - maximum verification attempts
  - token consumption/invalidation after successful reset
- All active sessions for the user are revoked after successful password reset.
- Auth-critical writes are wrapped in DB transactions (`BEGIN/COMMIT/ROLLBACK`).
- SQL statements in auth flows use parameterized queries.
- Signup/login inputs are normalized and validated (email format checks, reset code format checks).
- Account state checks are enforced during login:
  - banned account check
  - email verification check
- Auth event logging includes masked/derived identity metadata (e.g., masked email, email hash).

