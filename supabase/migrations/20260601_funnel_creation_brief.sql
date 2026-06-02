-- Store the coach's brief that generated a quiz: provenance, regenerate-later,
-- and ICP-language intel. Nullable (legacy quizzes + "draft from my brand" have none).
ALTER TABLE cp_funnels
  ADD COLUMN IF NOT EXISTS creation_brief text;

COMMENT ON COLUMN cp_funnels.creation_brief IS
  'The coach''s natural-language brief (typed or spoken) that generated this quiz. Null when generated from Brand OS alone or for legacy rows.';
