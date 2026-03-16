# New Version Implementation Blueprint

Source: `plan/New-Version.drawio.png` (updated March 6, 2026)  
Target stack: existing Node/Express + PostgreSQL + existing frontend pages/components

## 1) Revision Goals

1. Restructure the product into clear modules after login:
   - Global board
   - Open library
   - Personal workspace
   - Subjects
   - ComLab (communications and collaborations)
   - Rooms
2. Enforce strict role-based and scope-based access.
3. Expand governance:
   - admin moderation actions
   - report lifecycle
   - appeals
   - restricted-content workflow
4. Add collaboration depth through Workbench + Taskboard.
5. Add controlled AI usage (summaries/scanning) with auditable actions.

## 2) Non-Goals (for this revision window)

1. Replacing the entire frontend framework.
2. Replacing PostgreSQL/Mongo architecture.
3. Full real-time event rearchitecture (keep incremental with existing polling/socket patterns where present).

## 3) Current Codebase Mapping

The system already has most foundations. Keep and extend these modules:

1. Auth and account: `server/routes/auth.js`
2. Main feed/posts: `server/routes/posts.js`
3. Profile: `server/routes/profile.js`
4. Open library: `server/routes/library.js`
5. Connections/chat: `server/routes/connections.js`
6. Communities/subjects-like behavior: `server/routes/community.js`
7. Rooms: `server/routes/rooms.js`
8. Notifications: `server/routes/notifications.js`
9. Admin: `server/routes/admin.js`
10. Search: `server/routes/search.js`
11. Schema base: `server/db/schema.sql`

## 4) Target Module Architecture

## 4.1 Global Board

1. Add feed toggle:
   - `global` = cross-course public feed
   - `course` = only same-course feed
2. Ranking remains score-based, but visibility gating runs first.

## 4.2 Open Library

1. Library displays files shared from user vault/public sources.
2. Respect visibility labels:
   - `private`: uploader only
   - `course_exclusive`: users in same course
   - `public`: all users

## 4.3 Personal Workspace

1. User-owned vault with visibility toggle per file.
2. Files can be promoted to open library based on visibility.

## 4.4 Subjects

1. Subject list is derived from the logged-in user course context.
2. Subject posts are scoped to subject membership and policy.
3. Subject posts can reference Open Library documents.

## 4.5 ComLab

Contains:
1. Chat/group chat
2. Follow/unfollow system
3. Workbench (shared markdown graph workspace)
4. Taskboard (personal/collaborative tasks linked to workbench)

## 4.6 Rooms

1. Keep current room stack.
2. Add controlled AI summarization/transcript extraction if consent policy passes.

## 5) RBAC Blueprint (Authoritative)

Roles:
1. `owner` (system-wide super-admin)
2. `admin` (global admin, but cannot alter owner)
3. `professor` (course/workbench supervisory privileges)
4. `member` (student/member)
5. `community_moderator` (scoped role; not a global account role)

Policy rules:
1. Owner inherits all admin capabilities plus owner-only actions.
2. Admin cannot:
   - ban/delete owner
   - transfer ownership
   - assign another admin (if owner-only policy is kept)
3. Professor privileges are scoped:
   - to their workbench/course domains only
4. Community moderator privileges are scoped to assigned community.
5. Member has no admin panel access.

Minimum enforcement points:
1. API middleware checks on every admin/moderation endpoint.
2. SQL-level filters by course/community/workbench scope.
3. Audit log entry required for every moderation action.

## 6) Identity and Onboarding Blueprint

Required during sign-up/onboarding:
1. Course
2. Gender
3. Content preference
4. Student number

Verification workflow:
1. `pending` on signup
2. Owner/admin/professor verifies student identity
3. `approved` or `rejected`
4. If rejected/suspended/banned, user can file appeal

## 7) Data Model Blueprint (Schema Deltas)

Use additive migrations (`ALTER ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).

## 7.1 Accounts/Profile Extensions

Add to `accounts`:
1. `gender TEXT`
2. `content_preference JSONB NOT NULL DEFAULT '{}'::jsonb`
3. `student_number TEXT`
4. `id_verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (id_verification_status IN ('pending','approved','rejected'))`
5. `id_verified_by_uid TEXT REFERENCES accounts(uid) ON DELETE SET NULL`
6. `id_verified_at TIMESTAMPTZ`

Add indexes:
1. `accounts_platform_role_idx`
2. `accounts_id_verification_status_idx`
3. `accounts_student_number_idx` (unique if policy requires)

## 7.2 Vault + Library Visibility Unification

If not present, normalize visibility in `documents`:
1. expand `visibility` check to `('private','course_exclusive','public')`
2. add `source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('vault','library'))`

## 7.3 Subject Domain

Create:
1. `subjects`
2. `subject_memberships`
3. `subject_posts`
4. `subject_comments`
5. `subject_post_likes`

Core constraints:
1. Subject belongs to course.
2. Membership state tracked (`pending/member/left/banned`).
3. Subject content references optional document UUID.

## 7.4 Workbench Domain

Create:
1. `workbenches` (owner_uid, visibility, course scope)
2. `workbench_members`
3. `workbench_nodes` (markdown files)
4. `workbench_edges` (node-to-node links + connection description)
5. `workbench_notes` (AI/human notes anchored to node/edge)
6. `workbench_professor_assignments` (scoped professor privilege)

## 7.5 Taskboard Domain

Create:
1. `task_groups` (linked to workbench)
2. `tasks`
3. `task_assignees`
4. `task_submissions` (file upload requirement)
5. `task_status_history`

Task types:
1. `personal`
2. `collaborative`

## 7.6 Moderation, Restriction, Appeals

Create/extend:
1. `restricted_content_queue`
2. `appeals`
3. `appeal_messages`
4. `moderation_penalties` (warn/suspend/ban history)

Report lifecycle states:
1. `open`
2. `under_review`
3. `action_taken`
4. `no_action`
5. `rejected`
6. `restored` (if temporary restriction is lifted)

## 7.7 AI Governance Tables

Create:
1. `ai_audit_events`
2. `ai_usage_daily` (quotas/cost controls)
3. `ai_content_scans`
4. `room_ai_summaries` (only when consent is valid)

## 8) API Blueprint (Route-by-Route Deltas)

## 8.1 Existing Route Extensions

1. `POST /api/signup` (auth):
   - accept onboarding required fields
   - initialize verification status
2. `GET /api/posts` (posts):
   - add `feedScope=global|course`
3. `GET /api/library/documents` (library):
   - apply unified visibility policy
4. `GET /api/admin/accounts` (admin):
   - include verification and student-number review fields
5. `POST /api/admin/reports/action` (admin):
   - write to `restricted_content_queue` + penalty history

## 8.2 New Endpoints

Subjects:
1. `GET /api/subjects/bootstrap`
2. `GET /api/subjects/:id/feed`
3. `POST /api/subjects/:id/posts`
4. `POST /api/subjects/:id/posts/:postId/like`
5. `POST /api/subjects/:id/posts/:postId/comments`

Workbench:
1. `GET /api/workbench`
2. `POST /api/workbench`
3. `GET /api/workbench/:id`
4. `PATCH /api/workbench/:id`
5. `POST /api/workbench/:id/nodes`
6. `PATCH /api/workbench/:id/nodes/:nodeId`
7. `POST /api/workbench/:id/edges`
8. `POST /api/workbench/:id/ownership-transfer`

Taskboard:
1. `GET /api/workbench/:id/tasks`
2. `POST /api/workbench/:id/tasks`
3. `PATCH /api/tasks/:taskId`
4. `POST /api/tasks/:taskId/submit`
5. `POST /api/tasks/:taskId/assign`

Appeals:
1. `POST /api/appeals`
2. `GET /api/appeals/me`
3. `GET /api/admin/appeals`
4. `POST /api/admin/appeals/:id/resolve`

AI controls:
1. `POST /api/ai/scan-content`
2. `POST /api/rooms/:id/ai-summary`
3. `GET /api/admin/ai-usage`

## 9) Feed and Visibility Enforcement Rules

Apply in this exact order:

1. Hard restriction gate:
   - banned/suspended users
   - restricted/taken-down content
2. Privacy/block gate:
   - blocked users
   - hidden authors
3. Scope gate:
   - private/course/public
   - subject/community/workbench membership
4. Feed scope gate:
   - global vs course
5. Ranking:
   - recency + engagement + relationship boosts

## 10) Moderation and Appeals Operating Rules

1. Reported content may be temporarily restricted.
2. Legal/high-severity categories can bypass timed restoration and stay restricted until manual resolution.
3. Every disciplinary action must:
   - store actor, reason, target, duration
   - notify target account
   - create appeal option when applicable
4. Appeal decisions must be audited and immutable in logs.

## 11) AI Policy Guardrails

1. AI scanning/summarization requires explicit scope checks.
2. Room summarization requires participant consent policy.
3. AI cannot execute moderation actions directly; it can only recommend.
4. All AI actions must write audit records with request scope metadata.
5. Add per-user and per-day usage quotas to avoid runaway costs.

## 12) Implementation Phases (Execution Plan)

Phase 1: Authorization and identity foundation
1. Finalize RBAC constants and middleware.
2. Add onboarding + ID verification schema/API.
3. Add appeals tables and base endpoints.

Phase 2: Scope and feed correctness
1. Implement unified visibility model.
2. Add global/course feed toggle backend and frontend.
3. Add subject domain MVP (read + post + comment + like).

Phase 3: ComLab expansion
1. Implement workbench core (workspace, nodes, edges).
2. Implement taskboard core (personal/collaborative, assignment/submission).
3. Integrate chat/group chat linkage with workbench/taskboard context.

Phase 4: Governance and AI
1. Admin restricted-content and appeals manager UI/API.
2. AI scanning and summarization with audit/consent controls.
3. Usage dashboard for owner/admin.

Phase 5: Hardening
1. Security tests for role/scope bypass.
2. Performance tuning and indexes.
3. Migration verification in staging and Cloud SQL import validation.

## 13) Acceptance Criteria

1. Owner can perform all admin actions plus ownership transfer.
2. Admin cannot affect owner account.
3. Professor actions are blocked outside authorized scope.
4. Student/member cannot access admin panel or restricted actions.
5. Feed toggle works and returns correct dataset by scope.
6. Subject/workbench/taskboard permissions enforce membership.
7. Restricted content and appeals flow are fully traceable in audit logs.
8. AI actions are auditable and policy-compliant.
9. `server/db/schema.sql` remains import-safe for Cloud SQL.

## 14) Cloud SQL / Deployment Notes

1. Keep migration scripts idempotent.
2. Add migration version tracking table if not already present.
3. Validate large-table index creation times before production rollout.
4. Roll out in feature flags:
   - `FEATURE_SUBJECTS`
   - `FEATURE_WORKBENCH`
   - `FEATURE_TASKBOARD`
   - `FEATURE_AI_MODERATION_SCAN`

## 15) Immediate Next Deliverables

1. Produce a migration patch set for `server/db/schema.sql`.
2. Produce RBAC middleware refactor plan by route file.
3. Produce endpoint-by-endpoint implementation checklist with owners and estimates.

