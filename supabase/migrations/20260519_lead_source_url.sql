-- Add source_url to cp_leads: captures the page URL (blog article, landing
-- page, quiz result) that brought the lead in. Used for automatic pain-signal
-- inference — e.g. a lead arriving from /blog/healing-after-heartbreak gets
-- tagged with pain_signal = ['heartbreak'] automatically.

ALTER TABLE cp_leads ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN cp_leads.source_url IS 'URL of the page that referred this lead (blog post, landing page, etc). Used for automatic pain-signal inference.';
