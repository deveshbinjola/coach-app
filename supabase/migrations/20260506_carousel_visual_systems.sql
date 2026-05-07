-- Expand carousel preferences from generic styles into reusable visual systems.
--
-- Self-contained because some live projects may not have run the earlier
-- carousel preference migration yet.

alter table public.cp_coach_settings
  add column if not exists carousel_brand_name text,
  add column if not exists carousel_handle text,
  add column if not exists carousel_default_style text not null default 'onyx_gold',
  add column if not exists carousel_accent_color text not null default '#00FF41',
  add column if not exists carousel_custom_style jsonb;

alter table public.cp_coach_settings
  drop constraint if exists cp_coach_settings_carousel_default_style_check;

alter table public.cp_coach_settings
  drop constraint if exists cp_coach_settings_carousel_accent_color_check;

alter table public.cp_coach_settings
  add constraint cp_coach_settings_carousel_default_style_check
  check (
    carousel_default_style in (
      'onyx_gold',
      'forest_sand',
      'editorial_gold',
      'hard_facts',
      'imported',
      'dark_authority',
      'clean_cream',
      'accent_flash',
      'midnight_citron',
      'black_gold'
    )
  );

alter table public.cp_coach_settings
  add constraint cp_coach_settings_carousel_accent_color_check
  check (carousel_accent_color ~ '^#[0-9A-Fa-f]{6}$');

notify pgrst, 'reload schema';
