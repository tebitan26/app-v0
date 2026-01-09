-- Adds resale states and anti-race uniqueness for resale checkout.

alter type resale_state add value if not exists 'CHECKOUT_PENDING';
alter type resale_state add value if not exists 'SOLD';
alter type resale_state add value if not exists 'CANCELLED';

create unique index if not exists ticket_resales_unique_open_idx
  on public.ticket_resales (ticket_id)
  where state in ('OPEN', 'CHECKOUT_PENDING');
