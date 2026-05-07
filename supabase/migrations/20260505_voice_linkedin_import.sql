-- Phase 15.1: Add LinkedIn as a first-class voice import source.

alter table public.cp_voice_training_sources
  drop constraint if exists cp_voice_training_sources_source_type_check;

alter table public.cp_voice_training_sources
  add constraint cp_voice_training_sources_source_type_check
  check (source_type in ('sales_call', 'voice_note', 'workshop', 'instagram', 'linkedin', 'newsletter', 'paste'));
