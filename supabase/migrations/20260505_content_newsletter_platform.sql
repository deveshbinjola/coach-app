-- Content room: allow newsletter drafts in cp_content.
--
-- Content is now a first-class room alongside Command, Leads, and Voice.
-- Newsletter needs to live in the same draft library as Instagram,
-- LinkedIn, and carousel assets so the coach can repurpose one signal
-- across formats.

alter table public.cp_content
  drop constraint if exists cp_content_platform_check;

alter table public.cp_content
  add constraint cp_content_platform_check
  check (platform in ('linkedin', 'instagram', 'twitter', 'facebook', 'newsletter'));

alter table public.cp_content
  drop constraint if exists cp_content_content_type_check;

alter table public.cp_content
  add constraint cp_content_content_type_check
  check (content_type in ('post', 'carousel', 'story', 'reel', 'thread', 'newsletter'));

notify pgrst, 'reload schema';
