-- Pending voice profiles created by the public Find Your Voice magnet,
-- keyed by email, claimed by the coach-app on first login.
CREATE TABLE IF NOT EXISTS cp_pending_voice_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  voice_json      JSONB NOT NULL,
  sample_messages TEXT[] NOT NULL DEFAULT '{}',
  source          TEXT NOT NULL DEFAULT 'find_your_voice_magnet',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at      TIMESTAMPTZ,
  claimed_by      UUID REFERENCES cp_coaches(id)
);

-- Fast lookup of the newest unclaimed profile for an email (case-insensitive).
CREATE INDEX IF NOT EXISTS idx_pending_voice_email_unclaimed
  ON cp_pending_voice_profiles (lower(email))
  WHERE claimed_at IS NULL;

ALTER TABLE cp_pending_voice_profiles ENABLE ROW LEVEL SECURITY;
-- No public policies on purpose. The marketing-site write and the coach-app
-- claim both use the service role, which bypasses RLS. No anon access.
