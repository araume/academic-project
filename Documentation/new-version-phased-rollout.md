# New Version Phased Rollout (6 Phases)

This rollout divides the full revision into 6 deployable phases.  
Each phase is designed to keep the system functional while adding scoped capabilities.

References:
1. `plan/New-Version.drawio.png`
2. `Documentation/new-version-implementation-blueprint.md`
3. `Documentation/new-version-blueprint-cross-analysis.md`
4. MCP copy location: `gcloud-mcp-copy/server.py`
5. Phase 6 runbook: `Documentation/phase-6-runbook.md`

## Global rollout rules

1. Use additive and idempotent DB migrations only.
2. Ship behind feature flags where behavior changes are broad.
3. Keep backward-compatible API response shapes until the UI is switched.
4. Require pass criteria for each phase before moving to next.
5. Log every moderation/role-sensitive mutation into audit trails.

---

## Phase 1: Identity, RBAC, and Access Gates

Goal:
1. Establish authoritative permissions and onboarding gates so all later modules are safe by default.

Scope:
1. Finalize role matrix:
   - owner
   - admin
   - professor
   - member
   - scoped community/workbench moderator
2. Add onboarding fields and verification status.
3. Enforce login gate for unapproved student ID.
4. Add banned-login response contract with appeal-entry path.

DB actions:
1. Extend `accounts` with onboarding/verification columns.
2. Add indexes for role and verification status filtering.
3. Add base appeals tables for warning/suspension/ban appeals.

API actions:
1. Extend `POST /api/signup`.
2. Update login/auth session bootstrap behavior for gated users.
3. Add appeal creation endpoint reachable from ban notice flow.
4. Add reusable authorization middleware for owner/admin/professor scoped checks.

UI actions:
1. Add/validate onboarding fields in signup.
2. Add ban notice page with appeal button.
3. Add blocked/gated user UX state for pending ID verification.

Exit criteria:
1. Unauthorized role actions are denied consistently across admin/community/workbench endpoints.
2. Pending ID accounts cannot enter app modules.
3. Banned users can submit appeal without full access.

Feature flags:
1. `FEATURE_ID_VERIFICATION_GATE`
2. `FEATURE_BAN_APPEAL_ENTRY`

---

## Phase 2: Content Scope Core (Feed, Library, Subjects)

Goal:
1. Normalize visibility and scope behavior across global board, personal workspace, open library, and subjects.

Scope:
1. Global board feed toggle: global/course.
2. Personal file visibility: private/course_exclusive/public.
3. Open library reads from shareable vault/library sources.
4. Subjects MVP with final access policy.

Required policy decision:
1. Subject access model:
   - auto-visible/auto-member for all students in same course, or
   - explicit subject membership workflow.

DB actions:
1. Normalize `documents.visibility` to include course-exclusive mode.
2. Add/normalize source flag for vault vs library.
3. Create subject domain tables:
   - subjects
   - subject memberships
   - subject posts/comments/likes

API actions:
1. Extend `GET /api/posts` with `feedScope=global|course`.
2. Extend `GET /api/library/documents` with unified scope enforcement.
3. Add `GET /api/subjects/bootstrap`.
4. Add subject feed + post + comment + like endpoints.

UI actions:
1. Feed scope toggle in home/global board.
2. Visibility controls in personal workspace and upload flow.
3. Subject pages/lists for course-scoped discovery.

Exit criteria:
1. Visibility precedence works consistently across feed/library/subjects.
2. Users see only allowed content per role and course scope.
3. Subject posting and linking open-library docs works end-to-end.

Feature flags:
1. `FEATURE_GLOBAL_COURSE_FEED`
2. `FEATURE_SUBJECTS`
3. `FEATURE_UNIFIED_VISIBILITY`

---

## Phase 3: Governance Core (Reports, Restricted Contents, Appeals Manager)

Goal:
1. Implement complete moderation lifecycle required by the diagram, including 30-day restricted-content handling.

Scope:
1. Reports manager + content manager operational flow.
2. Restricted contents queue with restore and purge lifecycle.
3. Library document manager actions for privacy/legal/exclusivity.
4. Appeals manager with admin resolution workflow.
5. Custom admin notifications tied to moderation outcomes.

DB actions:
1. Create `restricted_content_queue` with:
   - hidden_at
   - restore_deadline_at
   - restored_at
   - purged_at
2. Add moderation penalty history if not present (`warn/suspend/ban` records).
3. Extend appeals resolution linkage to penalties/content decisions.

API actions:
1. Add endpoints for restrict/restore/purge actions.
2. Extend admin reports action pipeline to write restricted queue state.
3. Add `POST /api/admin/notifications/custom`.
4. Add `GET /api/admin/appeals` and resolution endpoints.

Ops actions:
1. Add scheduled purge job for restricted items past 30 days.

UI actions:
1. Add Restricted Contents page in admin with countdown and restore actions.
2. Add Appeals manager view in admin.
3. Add moderation action composer (reason + duration + notification).

Exit criteria:
1. Reported content can be restricted, restored, or purged with full audit trail.
2. 30-day lifecycle executes correctly via scheduler.
3. Appeal outcomes update affected account/content status correctly.

Feature flags:
1. `FEATURE_RESTRICTED_CONTENTS`
2. `FEATURE_ADMIN_APPEALS`
3. `FEATURE_ADMIN_CUSTOM_NOTIFICATION`

---

## Phase 4: ComLab Collaboration (Workbench + Taskboard + Requests)

Goal:
1. Deliver non-AI collaboration functionality for workbench and taskboard with role-correct controls.

Scope:
1. Workbench creation/request approval flow.
2. Workbench nodes/edges/connection descriptions.
3. Ownership transfer flow with accept/reject response.
4. Temporary scoped privilege elevation when student accepts ownership.
5. Taskboard with personal/collaborative tasks and file-required completion.

DB actions:
1. Create workbench domain tables.
2. Create transfer-request table for ownership handoff.
3. Create taskboard tables:
   - task groups
   - tasks
   - task assignees
   - task submissions
   - status history

API actions:
1. Add workbench CRUD and node/edge endpoints.
2. Add workbench request + approval endpoints.
3. Add ownership transfer request and respond endpoints.
4. Add taskboard CRUD + assignment + submission endpoints.

UI actions:
1. Workbench board with node graph and edge descriptions.
2. Ownership transfer notification + accept/reject UI.
3. Taskboard dashboard with assignee and required-file status controls.

Exit criteria:
1. Members can request workbench instances.
2. Professors/admins can moderate only allowed scopes.
3. Ownership transfer and temporary privilege assignment work and expire as designed.
4. Tasks can require file upload before completion state.

Feature flags:
1. `FEATURE_WORKBENCH`
2. `FEATURE_TASKBOARD`
3. `FEATURE_WORKBENCH_TRANSFER`

---

## Phase 5: AI + MCP Integration

Goal:
1. Integrate OpenAI and MCP capabilities safely with auditable and scoped execution.

Scope:
1. OpenAI scanning for irregularities (posts/documents).
2. Optional room summarize/keypoint extraction.
3. Workbench AI notes/summaries with provenance.
4. MCP contract using copied server (`gcloud-mcp-copy/server.py`):
   - explicit allowlist actions
   - timeout/retry/fallback
   - actor and scope audit logs

DB actions:
1. Add AI usage/audit tables:
   - ai_audit_events
   - ai_usage_daily
   - ai_content_scans
   - room_ai_summaries
2. Add provenance fields for AI-generated notes/items.

API actions:
1. Add scan endpoints and admin usage endpoints.
2. Add room summary endpoint with consent gate.
3. Add MCP invocation service wrapper with policy checks and observability.

Policy actions:
1. Define consent policy for room summarization.
2. Define per-user/day AI quotas and fail-safe behavior when exceeded.

UI actions:
1. Admin dashboard cards for AI usage and scan status.
2. Consent and status indicators in Rooms/Workbench where AI is active.

Exit criteria:
1. AI and MCP actions are scope-checked and fully auditable.
2. MCP cannot run arbitrary commands outside allowlist.
3. Quotas and error fallbacks prevent service degradation.

Feature flags:
1. `FEATURE_AI_SCAN`
2. `FEATURE_ROOM_AI_SUMMARY`
3. `FEATURE_GCLOUD_MCP`

---

## Phase 6: Stabilization, Performance, and Production Cutover

Goal:
1. Harden all modules and make Cloud SQL deployment/migration safe and repeatable.

Scope:
1. Security regression tests for all role/scope boundaries.
2. Performance tests for feed/library/chat/workbench/taskboard.
3. Final schema alignment and import validation for Cloud SQL.
4. Observability and runbook completion.

DB/infra actions:
1. Validate `server/db/schema.sql` reflects all new tables/constraints/indexes.
2. Add migration version ledger if missing.
3. Tune indexes based on slow query logs.

API/UI actions:
1. Remove deprecated response variants after frontend cutover.
2. Finalize UX polish and error-state consistency.

Go-live checklist:
1. Phase flags toggled in sequence in staging first.
2. Rollback plan per phase verified.
3. Backups and restore drills confirmed.
4. Admin and support playbooks updated.

Exit criteria:
1. All acceptance criteria from blueprint are met.
2. Staging soak period passes with no critical regressions.
3. Production release proceeds with monitored ramp-up.

---

## Suggested execution cadence

1. Phase 1 to Phase 2: blocker sequence, no overlap.
2. Phase 3 can begin once Phase 1 is stable.
3. Phase 4 can begin in parallel with late Phase 3 backend tasks.
4. Phase 5 starts after Phase 4 data contracts are stable.
5. Phase 6 is mandatory before full production enablement.

## Ownership recommendation

1. Backend lead: Phases 1, 3, 4, 5.
2. Frontend lead: Phases 2, 3, 4, 6 UX hardening.
3. DevOps/DB lead: Phases 5, 6.
4. QA lead: test plan from Phase 2 onward, full regression in Phase 6.
