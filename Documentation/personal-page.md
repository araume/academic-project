# Personal Page Documentation

## Scope
This document covers the Personal page implementation and the nav enhancements loaded on this page.

Primary files:
- `src/pages/personal.html`
- `src/styles/personal.css`
- `src/styles/nav.css`
- `src/js/personal.js`
- `src/js/nav-admin-link.js`
- `server.js` (page route protection)
- `server/routes/personal.js`
- `server/routes/library.js` (context document picker source)
- `server/routes/profile.js` (nav avatar data)
- `server/routes/notifications.js`
- `server/routes/search.js`
- `server/routes/admin.js` (admin context + mobile-app page content)
- `server/middleware/requireAuth.js`
- `server/middleware/requireAuthApi.js`
- `server/auth/sessionStore.js`

## Programming Languages Used
- HTML5: tabbed Personal workspace, forms, task board, AI chat area, and modals.
- CSS3: responsive tab/layout styling, journal/task card design, chat UI, modal behavior, nav overlays.
- JavaScript (Browser): tab state, CRUD form handling, chat streaming UX, context picker, markdown rendering.
- JavaScript (Node.js): authenticated Personal APIs for journals/tasks/conversations/proposals/context and AI responses.
- SQL (PostgreSQL): context-document lookup from `documents`, nav/search/notification/admin supporting APIs.
- MongoDB query language: personal journals, folders, tasks, AI conversations/messages/task proposals.

## Features Implemented On This Page

### 1) Authenticated Personal Workspace
- Route is protected at `GET /personal` with `requireAuth`.
- Three tab modules:
  - Journal
  - Tasks
  - AI Chatbot

### 2) Journal Workspace
- Folder management:
  - list folders (`GET /api/personal/journal-folders`)
  - create folder (`POST /api/personal/journal-folders`)
  - delete folder (`DELETE /api/personal/journal-folders/:id`)
- Entry management:
  - list entries (`GET /api/personal/journals`)
  - create entry (`POST /api/personal/journals`)
  - edit entry (`PATCH /api/personal/journals/:id`)
  - delete entry (`DELETE /api/personal/journals/:id`)
- Entry editor supports title, folder, tags, and markdown content.
- Journal reader panel shows selected entry metadata/content.

### 3) Task Board
- Kanban-style columns by status: Pending, Ongoing, Complete.
- Task CRUD:
  - list tasks (`GET /api/personal/tasks`)
  - create task (`POST /api/personal/tasks`)
  - update task/status (`PATCH /api/personal/tasks/:id`)
  - delete task (`DELETE /api/personal/tasks/:id`)
- Task form supports title, description, priority, due date, and tags.

### 4) AI Conversation Workspace
- Conversation management:
  - list (`GET /api/personal/conversations`)
  - create (`POST /api/personal/conversations`)
  - delete (`DELETE /api/personal/conversations/:id`)
- Message history per conversation:
  - fetch (`GET /api/personal/conversations/:id/messages`)
  - send (`POST /api/personal/conversations/:id/messages`)
- Supports streaming AI responses via NDJSON (`?stream=1` and `Accept: application/x-ndjson`).
- Conversation title is auto-derived from first user message when applicable.

### 5) AI-Driven Task Proposal Flow
- User prompts can produce a pending task proposal instead of immediate task writes.
- Proposal actions:
  - confirm proposal (`POST /api/personal/task-proposals/:id/confirm`) -> creates tasks
  - reject proposal (`POST /api/personal/task-proposals/:id/reject`)
- UI shows proposal action buttons (`Confirm tasks`, `Reject tasks`) when a proposal is active.

### 6) AI Context Document Support
- Context picker modal loads accessible library docs from `GET /api/library/documents`.
- Conversation context persistence:
  - set/clear context (`PATCH /api/personal/conversations/:id/context`)
- Context chip displays current linked document title and clear action.

### 7) Markdown Message Rendering (AI Chat UI)
- Client-side markdown rendering for assistant/user messages:
  - headings, paragraphs, lists, blockquotes, inline code, fenced code blocks, links, emphasis.

### 8) Global Nav Enhancements (Loaded On Personal)
- Admin menu entry injection: `GET /api/admin/me`
- Mobile-app modal content: `GET /api/site-pages/mobile-app`
- Global search modal: `GET /api/search` (all/posts/users/documents scopes)
- Notifications menu:
  - unread count (`GET /api/notifications/unread-count`)
  - list (`GET /api/notifications`)
  - mark one read (`POST /api/notifications/:id/read`)
  - mark all read (`POST /api/notifications/read-all`)

### 9) Session / Logout UX
- Nav avatar is loaded from `GET /api/profile`.
- Logout uses `POST /api/logout` then redirects to `/login`.

## Tools / Dependencies Used

### Installed Dependencies (NPM)
- `express`: page/API routing and middleware composition.
- `cookie-parser`: cookie-based session parsing for web/API auth.
- `mongodb`: Personal feature data persistence (journals/tasks/conversations/messages/proposals).
- `pg`: context-document and nav/search/notification/admin SQL-backed endpoints.
- `openai`: AI response generation, task intent analysis, and structured task extraction.
- `pdf-parse`: primary PDF text extraction for context-document excerpts.
- `@google-cloud/storage`: download of stored context documents for excerpt extraction.

### Platform / Built-in APIs and Modules
- Browser APIs:
  - `fetch`
  - streaming reader APIs (`response.body.getReader`, `TextDecoder`)
  - `setTimeout`
  - DOM/Event APIs
- Node built-ins:
  - `path` (file extension classification)
  - `zlib` (ZIP inflate for DOCX/PPTX XML extraction)

### Storage / Data Systems Used
- MongoDB collections (page-relevant): `personal_journals`, `personal_journal_folders`, `personal_tasks`, `ai_conversations`, `ai_messages`, `ai_task_proposals`.
- PostgreSQL tables (page-relevant): `documents` (context metadata lookup), plus nav-supporting notification/search/admin tables.
- Cloud object storage: context document binary retrieval for parsing/excerpt generation.

## Algorithms and Logic Patterns In This Page

### Frontend Algorithms
- Tab-state switching:
  - toggles active tab button/panel by `data-tab`.
- Journal folder composition:
  - groups entries by folder label, merges explicit folders + inferred extra folders + ungrouped bucket.
  - preserves expanded/collapsed folders with an `openFolders` `Set`.
- Conversation cache model:
  - stores conversation metadata in a `Map` keyed by conversation ID for fast context/header refresh.
- NDJSON stream consumer:
  - reads chunked response, buffers by newline, parses JSON events incrementally.
- Incremental streaming chat render:
  - appends assistant bubble and updates it by `delta` events.
- Custom markdown pipeline:
  - HTML escape first, then parse blocks/inlines and render structured markup.
- Context search debounce:
  - delays context document query by 250ms after typing.
- Proposal action state:
  - reveals/hides confirmation controls based on returned `proposalId`.

### Backend Algorithms
- Task-intent detection pipeline:
  - rule-based regex extraction (`extractProposedTasks`, `hasTaskIntent`) plus LLM-based classifiers (`analyzeTaskOrderIntent`, `inferTasksFromConversation`).
- Task normalization:
  - enforces task shape, trims fields, whitelists priority (`low|normal|urgent`), validates due-date format (`YYYY-MM-DD`), caps list length to 10.
- Proposal-first execution model:
  - AI-generated tasks are stored as pending proposals and only committed to `personal_tasks` on explicit confirmation.
- Conversation title derivation:
  - uses first user message (first six words, max length cap) when conversation still has default title.
- Streaming response orchestration:
  - supports streamed/non-streamed OpenAI paths and reconciles delta text with final output.
- MCP tool routing heuristic:
  - checks cloud-related keywords and conditionally sets tool choice for MCP-backed responses.
- Context excerpt extraction cascade:
  - classify file type by extension.
  - extract text from markdown/txt directly.
  - for PDF, parse with `pdf-parse`; fallback to OpenAI OCR when extracted text is short.
  - for DOCX/PPTX, parse ZIP entries and extract XML text content.
  - truncate normalized excerpt to configured max length.
- Conversation context persistence:
  - context UUID is validated against DB document record before storing in conversation.

## Security Measures In Place (Current)
- Access control:
  - `/personal` page is protected by `requireAuth`.
  - `/api/personal` endpoints are protected by `requireAuthApi`.
  - nav endpoints used on this page (`/api/search`, `/api/notifications`, `/api/admin/me`, `/api/site-pages/:slug`, `/api/profile`) are authenticated.
- Session protection:
  - server-side session store with expiration and periodic cleanup.
  - request session resolution supports cookie and bearer flows.
- Per-user data isolation:
  - journal/task/conversation/message/proposal operations are scoped by `userUid` in DB queries.
- Resource ownership and existence checks:
  - conversation existence and ownership are validated before reading/writing messages/context.
  - folder existence is validated before assigning journal entries.
  - context document UUID is validated before persistence.
- Identifier/input validation:
  - `ObjectId.isValid` checks for route IDs.
  - required-field checks for journal/task/message/proposal actions.
  - structured normalization for tags/tasks and date/priority fields in generated tasks.
- Controlled context parsing:
  - context file extraction enforces size cap (`CONTEXT_PARSE_MAX_BYTES`) before heavy parsing/OCR.
- Safe frontend rendering:
  - message markdown renderer escapes HTML before formatting.
  - markdown links are restricted to `http/https`; rendered external links use `noopener noreferrer`.
- Data access safety:
  - SQL queries for context documents/search/notifications/admin are parameterized.
  - profile photo and other storage-backed assets are served through signed URLs where configured.
