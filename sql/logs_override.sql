create table if not exists public.logs_override (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  event_id uuid not null,
  user_id uuid not null,
  created_at timestamptz default now(),
  justification text not null
);

create index if not exists logs_override_event_id_idx on public.logs_override (event_id);
create index if not exists logs_override_ticket_id_idx on public.logs_override (ticket_id);
create index if not exists logs_override_user_id_idx on public.logs_override (user_id);
