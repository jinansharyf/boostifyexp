
update public.app_settings set primary_color = '#5b189a'
  where id = 1 and primary_color in ('#2dd4a8','');

update public.app_settings
  set logo_url = '/__l5e/assets-v1/8a7ec683-440e-4754-9047-33cb3e6257df/boostify-logo.png'
  where id = 1 and (logo_url is null or logo_url = '');

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_settings' and policyname='App settings public read'
  ) then
    create policy "App settings public read" on public.app_settings for select using (true);
  end if;
end $$;

grant select on public.app_settings to anon, authenticated;
