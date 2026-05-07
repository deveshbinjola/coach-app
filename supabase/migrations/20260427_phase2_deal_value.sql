-- ═════════════════════════════════════════════════════════════════════════
-- Phase 2 analytics — money on leads
-- ═════════════════════════════════════════════════════════════════════════
--
-- Adds a single column: cp_leads.deal_value (numeric, nullable, in cents).
-- Storing in cents keeps arithmetic exact — no floating-point drift on
-- summed pipeline values.  $497 = 49700, $12000 = 1200000.  The UI
-- multiplies/divides by 100 at the input/render boundary.
--
-- Semantics:
--   • For a lead with status='client', this is the actual contract value.
--   • For non-terminal leads (new, contacted, qualified, booked), this
--     is the EXPECTED deal value if they close.  Coaches can set it
--     when they qualify a lead (before booking the call) so pipeline
--     value becomes a meaningful number.
--   • NULL = unset.  No assumed default — we'd rather show "—" than
--     fabricate a number.
--
-- Indexes intentionally NOT added.  Column is for analytics aggregation,
-- not lookup; partial-sum queries scan the whole table for a coach's
-- leads anyway, and that scan is bounded by RLS to one coach's rows.

ALTER TABLE cp_leads
  ADD COLUMN IF NOT EXISTS deal_value bigint NULL;

COMMENT ON COLUMN cp_leads.deal_value IS
  'Deal value in CENTS. NULL = unset. For status=client this is the actual close value; for non-terminal leads it is the expected close value. Stored in cents to avoid float drift on summed pipeline values.';

-- No data backfill: existing rows stay NULL until the coach sets a value.
-- Existing analytics queries continue to work — the strip on /command-center
-- and the analytics money panel both treat sum-of-NULL as zero gracefully.
