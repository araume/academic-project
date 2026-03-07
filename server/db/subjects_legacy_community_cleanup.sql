-- Legacy community-post cleanup after migrating to Subjects/Units.
-- Run this only if FEATURE_SUBJECTS is enabled and you no longer want old community-group posts surfaced.

BEGIN;

-- 1) Preview active legacy community posts.
SELECT COUNT(*)::bigint AS active_legacy_community_posts
FROM community_posts
WHERE status = 'active';

-- 2) Safe default: archive (hide) them instead of hard-deleting.
UPDATE community_posts
SET status = 'taken_down',
    taken_down_reason = COALESCE(taken_down_reason, 'Archived by Subjects migration cleanup'),
    updated_at = NOW()
WHERE status = 'active';

-- 3) Optional hard delete (uncomment ONLY if you want full removal).
-- DELETE FROM community_posts;

COMMIT;
