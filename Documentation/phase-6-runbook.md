# Phase 6 Runbook: Stabilization and Production Cutover

## 1) Preconditions

1. `server/db/schema.sql` is committed and reviewed.
2. Cloud SQL backup is created and restore path is tested.
3. Staging uses the same image tag and schema as planned production.

## 2) Apply and Validate Schema

Run these commands from the webapp repository:

```bash
npm run db:apply-schema
npm run db:validate-schema
```

Notes:
1. `db:apply-schema` creates/updates `schema_migrations` and records checksum of `server/db/schema.sql`.
2. `db:validate-schema` checks table/index presence against `schema.sql` and reports missing objects.

## 3) Readiness Verification

Service-level checks:

```bash
curl -sS https://<your-service-url>/healthz
curl -sS https://<your-service-url>/readyz
```

Admin diagnostics (owner/admin session required):

```bash
curl -sS https://<your-service-url>/api/admin/system/readiness
```

Expected:
1. `readyz.status = "ready"`
2. `missingCoreTables` is empty
3. `schema.checksumAligned = true`
4. `schema.missingTables` and `schema.missingIndexes` are empty

## 4) Feature Flag Rollout Sequence (Staging -> Production)

1. `FEATURE_WORKBENCH=true`
2. `FEATURE_TASKBOARD=true`
3. `FEATURE_WORKBENCH_TRANSFER=true`
4. `FEATURE_AI_SCAN=true`
5. `FEATURE_ROOM_AI_SUMMARY=true` (only after consent UX verification)
6. `FEATURE_GCLOUD_MCP=true`

Roll out one flag group at a time and watch logs/error rate between steps.

## 5) Smoke Checklist

1. Login/signup/session persistence.
2. Home feed load + post create/like/comment.
3. Open Library upload + view + permission checks.
4. Connections chat send/read/archive/mute flows.
5. Community join/rules-accept/post/comment.
6. Rooms create/join/end + participant state synchronization.
7. Workbench CRUD + taskboard + ownership transfer.
8. AI scan, room summary, and MCP actions produce audit records.
9. Admin views load (reports, restricted, appeals, AI usage, readiness).

## 6) Rollback

If critical errors occur:

1. Disable newest feature flag(s) first.
2. Redeploy last known good image.
3. If DB rollback is required, restore from pre-cutover backup.
4. Re-run `npm run db:validate-schema` after restore.

## 7) Ownership

1. Backend lead: schema/apply/validation and API readiness.
2. DevOps lead: backup, restore, Cloud Run rollout/ramp-up.
3. QA lead: staging soak and smoke checklist sign-off.
