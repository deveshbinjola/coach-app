-- ============================================================
-- Brand OS v5 schema delta
-- 2026-06-06
-- ============================================================
-- Pure additive. Legacy runs unaffected.
--
-- Adds:
--   * tier, variant_v, hold_until, unlocked_at, recovery_tier, recovery_token
--   * 11 structured-output columns (archetype, voice_profile, pillars, etc.)
--   * 3 indexes
--   * recovery_email_log table for tracking the legacy recovery sends
--
-- Apply via Supabase MCP, supabase CLI, or psql.
-- All ALTER TABLE statements use IF NOT EXISTS where possible so re-runs are safe.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Runtime + lifecycle columns
-- ------------------------------------------------------------
ALTER TABLE public.cp_brand_os_runs
  ADD COLUMN IF NOT EXISTS tier           TEXT,
  ADD COLUMN IF NOT EXISTS variant_v      TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS hold_until     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_tier  TEXT,
  ADD COLUMN IF NOT EXISTS recovery_token TEXT;

-- ------------------------------------------------------------
-- 2 · Structured output (JSONB)
-- ------------------------------------------------------------
ALTER TABLE public.cp_brand_os_runs
  ADD COLUMN IF NOT EXISTS archetype          TEXT,
  ADD COLUMN IF NOT EXISTS voice_profile      JSONB,
  ADD COLUMN IF NOT EXISTS anti_voice         JSONB,
  ADD COLUMN IF NOT EXISTS avatar_profile     JSONB,
  ADD COLUMN IF NOT EXISTS landing_state      JSONB,
  ADD COLUMN IF NOT EXISTS pre_post_ritual    JSONB,
  ADD COLUMN IF NOT EXISTS pillars            JSONB,
  ADD COLUMN IF NOT EXISTS held_draft         JSONB,
  ADD COLUMN IF NOT EXISTS offer_destination  JSONB,
  ADD COLUMN IF NOT EXISTS channel_anchor     TEXT,
  ADD COLUMN IF NOT EXISTS content_calendar   JSONB;

-- ------------------------------------------------------------
-- 3 · Value constraints
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cp_brand_os_runs_tier_check'
  ) THEN
    ALTER TABLE public.cp_brand_os_runs
      ADD CONSTRAINT cp_brand_os_runs_tier_check
      CHECK (tier IS NULL OR tier IN ('snapshot', 'full_round'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cp_brand_os_runs_variant_v_check'
  ) THEN
    ALTER TABLE public.cp_brand_os_runs
      ADD CONSTRAINT cp_brand_os_runs_variant_v_check
      CHECK (variant_v IN ('legacy', 'v5'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cp_brand_os_runs_recovery_tier_check'
  ) THEN
    ALTER TABLE public.cp_brand_os_runs
      ADD CONSTRAINT cp_brand_os_runs_recovery_tier_check
      CHECK (recovery_tier IS NULL OR recovery_tier IN ('skip', 'partial', 'full', 'gift'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cp_brand_os_runs_archetype_check'
  ) THEN
    ALTER TABLE public.cp_brand_os_runs
      ADD CONSTRAINT cp_brand_os_runs_archetype_check
      CHECK (archetype IS NULL OR archetype IN ('sage', 'lover', 'warrior', 'magician', 'creator', 'ruler'));
  END IF;
END$$;

-- ------------------------------------------------------------
-- 4 · Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_runs_variant_tier
  ON public.cp_brand_os_runs (variant_v, tier);

CREATE INDEX IF NOT EXISTS idx_runs_hold_until
  ON public.cp_brand_os_runs (hold_until)
  WHERE hold_until IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_recovery_token
  ON public.cp_brand_os_runs (recovery_token)
  WHERE recovery_token IS NOT NULL;

-- ------------------------------------------------------------
-- 5 · Recovery email log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cp_brand_os_recovery_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES public.cp_brand_os_runs(id) ON DELETE CASCADE,
  coach_id        UUID,
  recipient_email TEXT NOT NULL,
  recovery_tier   TEXT NOT NULL CHECK (recovery_tier IN ('partial', 'full', 'gift')),
  subject         TEXT NOT NULL,
  resend_message_id TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at      TIMESTAMPTZ,
  converted_at    TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_recovery_log_run_id
  ON public.cp_brand_os_recovery_log (run_id);

CREATE INDEX IF NOT EXISTS idx_recovery_log_sent_at
  ON public.cp_brand_os_recovery_log (sent_at DESC);

-- ------------------------------------------------------------
-- 6 · RLS · the new table inherits the same policy shape as cp_brand_os_runs
-- ------------------------------------------------------------
ALTER TABLE public.cp_brand_os_recovery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access" ON public.cp_brand_os_recovery_log;
CREATE POLICY "service role full access"
  ON public.cp_brand_os_recovery_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- 7 · Comments for downstream readers
-- ------------------------------------------------------------
COMMENT ON COLUMN public.cp_brand_os_runs.tier              IS 'v5: snapshot or full_round.';
COMMENT ON COLUMN public.cp_brand_os_runs.variant_v         IS 'legacy = pre-v5 runs. v5 = new designed flow.';
COMMENT ON COLUMN public.cp_brand_os_runs.hold_until        IS 'Tartt 24-hour integration hold. Calendar export locked until NOW() > hold_until.';
COMMENT ON COLUMN public.cp_brand_os_runs.unlocked_at       IS 'When the coach passed the unlock check email Kahneman question.';
COMMENT ON COLUMN public.cp_brand_os_runs.recovery_tier     IS 'Legacy recovery threshold. skip = below 4-answer floor.';
COMMENT ON COLUMN public.cp_brand_os_runs.recovery_token    IS 'Unique token for the recovery claim URL.';
COMMENT ON COLUMN public.cp_brand_os_runs.archetype         IS 'v5 Snapshot output. Classified from snapshot.wound.';
COMMENT ON COLUMN public.cp_brand_os_runs.voice_profile     IS 'v5 Snapshot output. Three sensory words + extracted markers.';
COMMENT ON COLUMN public.cp_brand_os_runs.anti_voice        IS 'v5 Snapshot output. Costume words the agent will never use.';
COMMENT ON COLUMN public.cp_brand_os_runs.avatar_profile    IS 'v5 Snapshot output. Named avatar with somatic detail.';
COMMENT ON COLUMN public.cp_brand_os_runs.landing_state     IS 'v5 Full Round output. The state the coach writes from when content lands.';
COMMENT ON COLUMN public.cp_brand_os_runs.pre_post_ritual   IS 'v5 Full Round output. 3-step 5-minute ritual.';
COMMENT ON COLUMN public.cp_brand_os_runs.pillars           IS 'v5 Full Round output. 3 named stances with proof artifacts.';
COMMENT ON COLUMN public.cp_brand_os_runs.held_draft        IS 'v5 Full Round output. One polished post in coach voice, held 24h.';
COMMENT ON COLUMN public.cp_brand_os_runs.content_calendar  IS 'v5 Full Round output. 30 to 45 day calendar.';
COMMENT ON TABLE  public.cp_brand_os_recovery_log           IS 'v5 legacy recovery sends. One row per recovery email dispatched.';
