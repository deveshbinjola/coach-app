-- Carousel builder preferences.
--
-- Coaches should not export assets branded as ElevateAI Coach. Store their
-- default carousel identity and visual style on the existing settings row.

alter table public.cp_coach_settings
  add column if not exists carousel_brand_name text,
  add column if not exists carousel_handle text,
  add column if not exists carousel_default_style text not null default 'dark_authority'
    check (carousel_default_style in ('dark_authority', 'clean_cream', 'accent_flash')),
  add column if not exists carousel_accent_color text not null default '#00FF41'
    check (carousel_accent_color ~ '^#[0-9A-Fa-f]{6}$');

notify pgrst, 'reload schema';
