-- Migration 0008 — landing content, telegram notifications, web push subscriptions

-- 1) Landing page content (single row id=1, edit from admin)
create table if not exists public.landing_content (
  id int primary key default 1,
  hero_title text,
  hero_subtitle text,
  hero_cta_label text,
  stats jsonb not null default '[]'::jsonb,    -- [{k,v}]
  features jsonb not null default '[]'::jsonb, -- [{t,d}]
  steps jsonb not null default '[]'::jsonb,    -- [{n,t,d}]
  cta_title text,
  cta_subtitle text,
  cta_label text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.landing_content (id) values (1) on conflict (id) do nothing;

grant select on public.landing_content to anon, authenticated;
grant all on public.landing_content to service_role;
alter table public.landing_content enable row level security;

drop policy if exists "landing public read" on public.landing_content;
create policy "landing public read" on public.landing_content for select using (true);
drop policy if exists "landing admin write" on public.landing_content;
create policy "landing admin write" on public.landing_content
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 2) Telegram notification settings
create table if not exists public.telegram_settings (
  id int primary key default 1,
  bot_token text,
  admin_chat_id text,        -- group/chat that receives admin alerts
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.telegram_settings (id) values (1) on conflict (id) do nothing;

grant select, insert, update on public.telegram_settings to authenticated;
grant all on public.telegram_settings to service_role;
alter table public.telegram_settings enable row level security;

drop policy if exists "telegram admin read" on public.telegram_settings;
create policy "telegram admin read" on public.telegram_settings
  for select to authenticated using (public.is_admin(auth.uid()));
drop policy if exists "telegram admin write" on public.telegram_settings;
create policy "telegram admin write" on public.telegram_settings
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 3) Web push subscriptions (browser push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;

drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4) VAPID public/private keys (web push) — admin-only
create table if not exists public.push_vapid (
  id int primary key default 1,
  public_key text,
  private_key text,
  subject text default 'mailto:admin@example.com',
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.push_vapid (id) values (1) on conflict (id) do nothing;
grant select on public.push_vapid to authenticated;  -- only public_key needed; private filtered in code
grant all on public.push_vapid to service_role;
alter table public.push_vapid enable row level security;
drop policy if exists "vapid admin all" on public.push_vapid;
create policy "vapid admin all" on public.push_vapid
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- reload PostgREST schema cache so /admin/setup checks see the changes immediately
NOTIFY pgrst, 'reload schema';
