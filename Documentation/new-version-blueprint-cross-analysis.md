# New Version Cross-Analysis

Compared artifacts:
1. Diagram: `plan/New-Version.drawio.png` (embedded draw.io XML extracted from PNG metadata)
2. Blueprint: `Documentation/new-version-implementation-blueprint.md`

Method:
1. Extracted and decoded `mxfile` metadata from PNG.
2. Parsed 53 unique text requirements from diagram nodes.
3. Mapped each requirement to blueprint sections and classified as:
   - `Covered`
   - `Partial`
   - `Missing`
   - `Extra in Blueprint`

## 1) Executive Summary

Coverage status:
1. Covered: 27
2. Partial: 20
3. Missing: 6
4. Extra in Blueprint (not explicit in diagram): 5

Primary risk:
1. Role-policy precision is still under-specified for `professor` and member onboarding gating.
2. Restricted-content flow is missing exact 30-day retention/restore mechanics.
3. Google MCP integration is present in diagram but not concretely defined in blueprint.

## 2) Requirement-Level Matrix

## 2.1 Core Navigation and Modules

1. `Global board (former homepage)` -> Covered
Action: none.

2. `Open library` -> Covered
Action: none.

3. `Personal workspace` -> Covered
Action: none.

4. `Subjects` -> Partial
Gap: blueprint adds membership states, while diagram implies all course students can see all course subjects by default.
Action: lock subject access policy:
   - Option A: auto-membership for all students in course
   - Option B: explicit membership with approval states
   - choose one and reflect in schema/api.

5. `ComLab (Communications & Collaborations)` -> Covered
Action: none.

6. `Rooms` -> Covered
Action: none.

7. `Profile manager` -> Partial
Gap: blueprint does not define dedicated capability list for profile manager.
Action: add profile-manager scope table (view/update profile fields, profile visibility, avatar governance).

8. `Account Manager` -> Partial
Gap: blueprint does not explicitly split account-manager operations from admin accounts manager.
Action: add explicit account manager responsibilities and ownership per role.

## 2.2 Login and Onboarding

1. `Ask user course, gender, content preference, student number` -> Covered
Action: none.

2. `Student/member cannot login until student ID verification approved` -> Partial
Gap: blueprint states verification workflow but not hard login-block behavior and exception paths.
Action:
   - enforce login gate on `id_verification_status != approved`
   - allow limited access to appeal flow page when gated
   - define bootstrap response contract for gated users.

## 2.3 Feed, Library, and Workspace Rules

1. `Global feed vs Course feed toggle` -> Covered
Action: none.

2. `Open library displays shareable documents from users' file vault` -> Covered
Action: none.

3. `Personal workspace three-way visibility: private/course/public` -> Covered
Action: none.

4. `Subjects show available subjects in user course, exclusive posts, open-library links, all subjects visible to course students` -> Partial
Gap: same as subject-policy conflict above.
Action: finalize one access model and codify.

## 2.4 ComLab, Workbench, Taskboard

1. `ComLab contains chat/groupchat, follow/unfollow, workbench, taskboard` -> Covered
Action: none.

2. `Workbench markdown directory + worknodes + edge descriptions + AI notes` -> Partial
Gap: blueprint includes data model and endpoints, but lacks explicit edge-hover UX contract and AI note moderation policy.
Action:
   - add UI contract for edge hover text
   - add AI note provenance fields (`source=ai|user`, model, timestamp)
   - add moderation controls for AI-created notes.

3. `Workbench supports multiple professors` -> Covered
Action: none.

4. `Workbench open vs invite-only` -> Covered
Action: none.

5. `Workbench ownership transfer to teacher/student with student acceptance and scoped temporary professor privileges` -> Partial
Gap: blueprint has transfer endpoint but no acceptance/reject endpoint and no temporary privilege expiry model.
Action:
   - add `workbench_ownership_transfers` table
   - add `POST /api/workbench/:id/ownership-transfer/respond`
   - add scoped, time-bound privilege records.

6. `Taskboard supports personal/collaborative tasks, assignment, file-required completion` -> Covered
Action: none.

## 2.5 AI and MCP

1. `Allow OpenAI to scan posts/documents for irregularities` -> Covered
Action: none.

2. `Allow AI to summarize/extract meet keypoints (under consideration)` -> Covered
Action: keep feature-flagged.

3. `Google MCP server` -> Missing
Gap: blueprint does not define MCP integration contract.
Action:
   - add MCP section with server URL config, tool whitelist, timeout/retry/fallback, audit logging
   - define which modules can invoke MCP and who can trigger them.

4. `Dashboard should track OpenAI usage, active users, system status, real-time activity logs` -> Partial
Gap: blueprint mentions AI usage and audit, but not complete ops telemetry package.
Action:
   - add metrics surface spec (`active_users`, `api_error_rate`, `queue_backlog`, `db_latency`)
   - add admin dashboard endpoints for real-time summaries.

## 2.6 Admin and Governance

1. `Admin panel components: Dashboard, Logs, Accounts manager, Content manager, Site pages, Reports, Library document manager, Appeals manager, Restricted contents` -> Partial
Gap: blueprint has all conceptually, but missing explicit “Site pages unchanged/frozen” and concrete library-doc-manager operations.
Action:
   - add freeze note for site pages scope
   - define doc-manager actions (`review`, `restrict`, `restore`, `hard-delete`).

2. `Admin can inspect content/comments and warn/suspend/ban through notifications` -> Partial
Gap: custom notification path is not fully specified.
Action:
   - add `POST /api/admin/notifications/custom`
   - add templates + abuse limits + audit entries.

3. `Account actions include warn/suspend/ban/custom notification/delete account/transfer ownership(owner)` -> Partial
Gap: transfer and delete are covered; custom notification missing endpoint-level definition.
Action: same as above.

4. `Restricted contents: removed content hidden for 30 days, admins can restore` -> Partial
Gap: 30-day retention + restore SLA + purge job are not explicit.
Action:
   - add `restricted_content_queue` fields: `hidden_at`, `restore_deadline_at`, `purged_at`
   - add scheduled job for auto-purge
   - add restore endpoint and UI status badges.

5. `Admins can inspect documents for privacy/legal/exclusivity issues` -> Partial
Gap: issue taxonomy not codified.
Action:
   - define controlled issue taxonomy enum
   - map each class to allowed actions and appeal routes.

## 2.7 Role-Specific Discipline Rules

1. `Owner can warn/suspend/ban all accounts` -> Covered
Action: none.

2. `Admin can warn/suspend/ban all except owner/admin` -> Covered
Action: none.

3. `Professor can warn/suspend/ban students only (system and workbench scope)` -> Partial
Gap: blueprint says scoped professor moderation but not precise per-domain matrix.
Action:
   - publish explicit permission matrix:
     - global system scope
     - course scope
     - workbench scope
   - enforce with dedicated middleware.

4. `Student/member no admin access, can request room/workbench starts` -> Partial
Gap: request paths are not explicitly specified for workbench.
Action:
   - add `POST /api/workbench/requests`
   - add approval flow endpoint(s) for professor/admin scope.

## 2.8 Appeals

1. `Users can appeal warnings/suspensions/bans` -> Covered
Action: none.

2. `Banned user login should show ban notice page with appeal button` -> Missing
Gap: not defined in blueprint.
Action:
   - add banned-login response contract and dedicated UI route/page
   - allow appeal submission without full app access.

## 3) Missing Components (Must Add)

1. Explicit Google MCP integration spec.
2. Banned-login notice page and appeal-entry flow.
3. 30-day restricted-content retention + restore + purge mechanics.
4. Custom admin notification endpoint and guardrails.
5. Workbench ownership transfer acceptance/rejection flow.
6. Subject access model finalization (auto-visible vs membership-state).

## 4) Extra Components Introduced by Blueprint (Not Explicit in Diagram)

1. `community_moderator` role in RBAC list.
2. Subject membership state machine (`pending/member/left/banned`).
3. AI usage quotas (`ai_usage_daily`).
4. Strong feed gating order definition.
5. Feature-flag rollout strategy.

Action:
1. Keep these if aligned with product goals.
2. If strict diagram fidelity is required, mark them as optional extensions.

## 5) Recommended Immediate Corrections to Blueprint

1. Add a dedicated section: `Google MCP Server Integration Contract`.
2. Add a dedicated section: `Banned Login UX and Appeal Entry`.
3. Expand moderation section with exact `30-day restricted-content lifecycle`.
4. Add endpoint and policy for `custom admin notifications`.
5. Add ownership transfer response flow for workbench recipients.
6. Add a single, explicit `Role Permission Matrix` table with owner/admin/professor/member across each module.

## 6) Implementation Priority

P0:
1. Role-permission matrix finalization.
2. Banned-login appeal entry.
3. Restricted-content 30-day lifecycle.
4. MCP integration spec.

P1:
1. Workbench ownership transfer acceptance flow.
2. Admin custom notification channel.
3. Subject access policy decision and enforcement.

P2:
1. Real-time dashboard telemetry expansion.
2. AI-note provenance and moderation tooling.

