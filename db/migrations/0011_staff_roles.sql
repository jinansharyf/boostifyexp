-- 0011_staff_roles.sql
-- Staff roles (manager, supervisor, officer) with zone-scoped visibility.

create table if not exists public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  staff_role text not null check (staff_role in ('manager','supervisor','officer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.staff_members to authenticated;
grant all on public.staff_members to service_role;
alter table public.staff_members enable row level security;
drop policy if exists "staff_members self read" on public.staff_members;
create policy "staff_members self read" on public.staff_members for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "staff_members admin write" on public.staff_members;
create policy "staff_members admin write" on public.staff_members for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists set_updated_at_staff_members on public.staff_members;
create trigger set_updated_at_staff_members before update on public.staff_members
  for each row execute function public.tg_set_updated_at();

create table if not exists public.staff_zones (
  user_id uuid not null references auth.users(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  primary key (user_id, zone_id),
  created_at timestamptz not null default now()
);
grant select on public.staff_zones to authenticated;
grant all on public.staff_zones to service_role;
alter table public.staff_zones enable row level security;
drop policy if exists "staff_zones self read" on public.staff_zones;
create policy "staff_zones self read" on public.staff_zones for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "staff_zones admin write" on public.staff_zones;
create policy "staff_zones admin write" on public.staff_zones for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Helpers
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_members where user_id = _user_id);
$$;

create or replace function public.staff_can_see_zone(_user_id uuid, _zone_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_zones where user_id = _user_id and zone_id = _zone_id);
$$;

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
