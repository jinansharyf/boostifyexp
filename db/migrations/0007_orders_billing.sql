-- 0007_orders_billing.sql
-- Pricing (vehicle types + zone×vehicle matrix), order extensions, partner billing.

-- Vehicle types -------------------------------------------------------------
create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.vehicle_types to authenticated;
grant all on public.vehicle_types to service_role;
alter table public.vehicle_types enable row level security;
drop policy if exists "vehicle_types read" on public.vehicle_types;
create policy "vehicle_types read" on public.vehicle_types for select to authenticated using (true);
drop policy if exists "vehicle_types admin write" on public.vehicle_types;
create policy "vehicle_types admin write" on public.vehicle_types for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_vehicle_types on public.vehicle_types;
create trigger set_updated_at_vehicle_types before update on public.vehicle_types
  for each row execute function public.tg_set_updated_at();

-- Delivery prices (zone × vehicle) -----------------------------------------
create table if not exists public.delivery_prices (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types(id) on delete cascade,
  price_per_delivery numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id, vehicle_type_id)
);
grant select on public.delivery_prices to authenticated;
grant all on public.delivery_prices to service_role;
alter table public.delivery_prices enable row level security;
drop policy if exists "delivery_prices read" on public.delivery_prices;
create policy "delivery_prices read" on public.delivery_prices for select to authenticated using (true);
drop policy if exists "delivery_prices admin write" on public.delivery_prices;
create policy "delivery_prices admin write" on public.delivery_prices for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_delivery_prices on public.delivery_prices;
create trigger set_updated_at_delivery_prices before update on public.delivery_prices
  for each row execute function public.tg_set_updated_at();

-- Extend orders -------------------------------------------------------------
alter table public.orders
  add column if not exists pickup_zone_id uuid references public.zones(id),
  add column if not exists vehicle_type_id uuid references public.vehicle_types(id),
  add column if not exists customer_name text;

-- Partner billing entries ---------------------------------------------------
create table if not exists public.partner_billing_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  partner_id uuid not null references public.vendors(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','paid','void')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.partner_billing_entries to authenticated;
grant all on public.partner_billing_entries to service_role;
alter table public.partner_billing_entries enable row level security;
drop policy if exists "billing read own or admin" on public.partner_billing_entries;
create policy "billing read own or admin" on public.partner_billing_entries for select to authenticated
  using (public.is_admin(auth.uid()) or exists (
    select 1 from public.vendors v where v.id = partner_id and v.owner_id = auth.uid()
  ));
drop policy if exists "billing admin write" on public.partner_billing_entries;
create policy "billing admin write" on public.partner_billing_entries for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_billing on public.partner_billing_entries;
create trigger set_updated_at_billing before update on public.partner_billing_entries
  for each row execute function public.tg_set_updated_at();

-- Partner payments (manual settlements) -------------------------------------
create table if not exists public.partner_payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.vendors(id) on delete cascade,
  amount numeric(10,2) not null,
  note text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
grant select on public.partner_payments to authenticated;
grant all on public.partner_payments to service_role;
alter table public.partner_payments enable row level security;
drop policy if exists "payments read own or admin" on public.partner_payments;
create policy "payments read own or admin" on public.partner_payments for select to authenticated
  using (public.is_admin(auth.uid()) or exists (
    select 1 from public.vendors v where v.id = partner_id and v.owner_id = auth.uid()
  ));
drop policy if exists "payments admin write" on public.partner_payments;
create policy "payments admin write" on public.partner_payments for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Auto-create billing entry on new order ------------------------------------
create or replace function public.tg_create_billing_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vendor_id is not null and coalesce(new.total, 0) > 0 then
    insert into public.partner_billing_entries (order_id, partner_id, amount, status)
    values (new.id, new.vendor_id, new.total, 'unpaid')
    on conflict (order_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists orders_billing_entry on public.orders;
create trigger orders_billing_entry after insert on public.orders
  for each row execute function public.tg_create_billing_entry();

-- Void billing entry when order cancelled -----------------------------------
create or replace function public.tg_void_billing_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and (old.status is distinct from new.status) then
    update public.partner_billing_entries
       set status = 'void'
     where order_id = new.id and status = 'unpaid';
  end if;
  return new;
end; $$;

drop trigger if exists orders_void_billing on public.orders;
create trigger orders_void_billing after update of status on public.orders
  for each row execute function public.tg_void_billing_on_cancel();

-- Allow vendors to insert their own orders + read; admins manage all.
drop policy if exists "orders insert own" on public.orders;
create policy "orders insert own" on public.orders for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
  );
drop policy if exists "orders read own or admin" on public.orders;
create policy "orders read own or admin" on public.orders for select to authenticated
  using (
    public.is_admin(auth.uid())
    or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
  );
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
