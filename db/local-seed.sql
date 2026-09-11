-- Fictional local-only seed. Never apply with wrangler --remote or to production.
-- Invitation is expired; token_hash is SHA-256 of "mirai-local-fictional-seed-v1", not a live bearer.
INSERT OR IGNORE INTO sessions (
  id, owner_id, token_hash, expires_at, data, revision, created_at, updated_at
) VALUES (
  '00000000-0000-4000-8000-f1c710000001',
  'local_seedy',
  'a679954a5a5242fe53d4f0b54497495243a7a1a640c9d59c291a45967e2b3b0c',
  '2000-01-01T00:00:00.000Z',
  '{"title":"Fictional local seed session","client":"Fictional workshop","template":"custom","language":"en","stage":"Discovery","answers":{"business":"Fictional local seed: a small workshop that tracks sample orders on paper.","problem":"Fictional local seed: rewriting the same quote by hand."},"demos":[],"feedback":[],"approvedDemoId":null}',
  0,
  '2026-09-11T00:00:00.000Z',
  '2026-09-11T00:00:00.000Z'
);
