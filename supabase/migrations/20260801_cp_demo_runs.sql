-- Landing page live demo: one row per run.
--
-- This is a rate-limit ledger, not analytics. The in-memory limiter in
-- lib/rate-limit.ts is per-isolate on Cloudflare, so it cannot actually bound
-- a public unauthenticated endpoint that spends money on every call. This can.
--
-- It deliberately stores NO pasted content. What a visitor pastes is a message
-- from one of their leads and a sample of their own writing, handed over to try
-- a demo, not to be kept. We store a salted hash of the IP and the shape of the
-- request, which is everything the limit needs and nothing it does not.
--
-- RLS on with no policies: the route writes with the service-role client.

create table if not exists public.cp_demo_runs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- sha256(ip + DEMO_IP_SALT). Not reversible to an address without the salt.
  ip_hash      text not null,
  message_chars integer not null,
  voice_chars   integer not null,
  ok           boolean not null default true
);

comment on table public.cp_demo_runs is
  'Landing page demo runs. Durable per-IP rate limiting. Never stores pasted content.';

alter table public.cp_demo_runs enable row level security;

create index if not exists cp_demo_runs_ip_window_idx
  on public.cp_demo_runs (ip_hash, created_at desc);
