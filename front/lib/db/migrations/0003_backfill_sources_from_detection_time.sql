-- Tracks recorded before runs were tracked have no source. Their detection
-- times still cluster into runs: rows within one analysis land seconds apart
-- as each segment is recognised, while separate analyses sit days apart. Split
-- on a 30 minute gap and synthesise one 'unknown' source per cluster, so the
-- existing library is usable in the grouped view instead of sitting in one
-- undifferentiated pile.
WITH ordered AS (
  SELECT
    id,
    team_id,
    user_id,
    created_at,
    CASE
      WHEN LAG(created_at) OVER w IS NULL
        OR created_at - LAG(created_at) OVER w > INTERVAL '30 minutes'
      THEN 1
      ELSE 0
    END AS starts_run
  FROM tracks
  WHERE source_id IS NULL
  WINDOW w AS (PARTITION BY team_id ORDER BY created_at, id)
),
grouped AS (
  SELECT
    id,
    team_id,
    user_id,
    created_at,
    SUM(starts_run) OVER (
      PARTITION BY team_id
      ORDER BY created_at, id
      ROWS UNBOUNDED PRECEDING
    ) AS run_no
  FROM ordered
),
runs AS (
  SELECT
    team_id,
    run_no,
    MIN(created_at) AS started_at,
    MIN(user_id) AS user_id
  FROM grouped
  GROUP BY team_id, run_no
),
inserted AS (
  INSERT INTO sources (team_id, user_id, kind, label, created_at)
  SELECT
    team_id,
    user_id,
    'unknown',
    'Unknown source · ' || to_char(started_at, 'DD Mon YYYY'),
    started_at
  FROM runs
  RETURNING id, team_id, created_at
)
UPDATE tracks t
SET source_id = inserted.id
FROM grouped
JOIN runs ON runs.team_id = grouped.team_id AND runs.run_no = grouped.run_no
JOIN inserted
  ON inserted.team_id = runs.team_id
 AND inserted.created_at = runs.started_at
WHERE t.id = grouped.id;
