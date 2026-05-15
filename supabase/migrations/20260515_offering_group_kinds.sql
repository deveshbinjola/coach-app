-- Split the single `mens_group` enum value into three distinct group kinds.
-- Coaches actually run masculine-embodiment groups, women's groups, AND
-- mixed-polarity groups — they're different containers and the label has
-- to reflect that.
--
-- Adds two new enum values alongside the existing mens_group. Existing
-- mens_group rows stay untouched (no rename, no migration of data).

alter type cp_offering_kind add value if not exists 'womens_group';
alter type cp_offering_kind add value if not exists 'mixed_group';
