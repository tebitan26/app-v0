-- Usage from Next.js API (Supabase client):
-- const { data, error } = await supabaseAdmin.rpc("purchase_resale", {
--   resale_id: "<resale_id>",
--   buyer_id: "<buyer_id>",
-- });

create or replace function public.purchase_resale(
  p_resale_id uuid,
  p_buyer_id uuid
) returns uuid
language plpgsql
as $$
declare
  resale_row record;
  ticket_row record;
  new_ticket_id uuid;
begin
  select r.*
    into resale_row
    from ticket_resales r
   where r.id = p_resale_id
   for update;

  if not found then
    raise exception 'resale_not_found';
  end if;

  if resale_row.state is distinct from 'OPEN' then
    raise exception 'not_open';
  end if;

  select t.*
    into ticket_row
    from tickets t
   where t.id = resale_row.ticket_id
   for update;

  if not found then
    raise exception 'ticket_not_found';
  end if;

  if upper(coalesce(ticket_row.status, '')) <> 'EN_REVENTE' then
    raise exception 'not_resellable';
  end if;

  if p_buyer_id = resale_row.seller_id then
    raise exception 'buyer_is_seller';
  end if;

  update tickets
     set status = 'REVENDU'
   where id = ticket_row.id
     and status = 'EN_REVENTE';

  if not found then
    raise exception 'ticket_state_conflict';
  end if;

  insert into tickets (owner_id, event_id, batch_id, status)
  values (p_buyer_id, ticket_row.event_id, ticket_row.batch_id, 'VALID')
  returning id into new_ticket_id;

  insert into logs_resale (
    ticket_id_old,
    ticket_id_new,
    event_id,
    seller_id,
    buyer_id,
    action,
    reason,
    created_at
  ) values (
    ticket_row.id,
    new_ticket_id,
    ticket_row.event_id,
    resale_row.seller_id,
    p_buyer_id,
    'SOLD',
    null,
    now()
  );

  update ticket_resales
     set state = 'SOLD',
         buyer_id = p_buyer_id,
         new_ticket_id = new_ticket_id,
         sold_at = now()
   where id = resale_row.id
     and state = 'OPEN';

  return new_ticket_id;
end;
$$;

create or replace function public.enforce_resale_list_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'EN_REVENTE' then
    if old.status <> 'VALID' then
      raise exception 'not_resellable';
    end if;
    if old.used_at is not null then
      raise exception 'ticket_already_used';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'enforce_resale_list_status'
  ) then
    create trigger enforce_resale_list_status
    before update of status on tickets
    for each row
    when (new.status = 'EN_REVENTE')
    execute function public.enforce_resale_list_status();
  end if;
end;
$$;
