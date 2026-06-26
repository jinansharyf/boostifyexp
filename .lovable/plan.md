## Switch to Lovable Cloud + Full Auth/Permissions Build

### Backend switch
- Enable Lovable Cloud (managed Supabase). Your data lives in a real Supabase project — you can view/edit it inside Lovable (Cloud → Database/Tables) **and** in the Supabase dashboard for that project. Same Postgres, same realtime, same `pg_dump` export. Anything you do in one shows up in the other instantly.
- Re-wire the app to the managed client (`@/integrations/supabase/client`) and drop the hand-rolled BYO client/middleware. Old `db/migrations/0001_init.sql` becomes a managed migration applied automatically.
- You should rotate/revoke the BYO service-role key you pasted earlier in your old Supabase project since it was shared in chat.

### Roles
Four roles seeded as an enum `app_role`:
- `customer`, `vendor`, `admin`, `super_admin`
- `super_admin` = you (`poday.developments@gmail.com`), seeded on first signup via trigger.
- Stored in separate `user_roles` table + `has_role()` security-definer (no recursive RLS).

### Admin-created accounts (temp password flow)
- Admin UI form: email + name + role (+ permissions for admin/vendor).
- Server function uses service role to `auth.admin.createUser({ email, password, email_confirm: true })` with an admin-typed temp password, inserts role + permissions, returns the password once in the UI for the admin to copy/share.
- New user is forced to change password on first login (flag `must_change_password` on `profiles`; `/auth/change-password` route gates the app until cleared).
- Only `super_admin` can create other admins; `admin` with `manage_users` can create vendors/customers.

### Per-permission flags
New table `user_permissions(user_id, permission)` with enum `app_permission`:
- `manage_orders`, `manage_menu`, `manage_users`, `manage_settings`, `manage_vendors`, `manage_zones`, `view_reports`, `manage_chat`
- Helper `has_permission(_user_id, _permission)` security-definer.
- `super_admin` implicitly has all permissions (short-circuit in helper).
- Admin "Edit user" screen = checkboxes per permission; vendor screen exposes a smaller subset (`manage_orders`, `manage_menu`, `manage_chat`).
- Route guards + UI gates both use `has_permission` (server-side via RLS, client-side via a `usePermissions` hook).

### System settings (admin-controlled branding)
`app_settings` singleton row with: `site_name`, `logo_url`, `favicon_url`, `primary_color`, `accent_color`, `heading_font`, `body_font`, `seo_title`, `seo_description`, `seo_keywords`, `og_image_url`, plus social/contact fields. Logo/favicon/OG uploaded to a `branding` storage bucket. A `SettingsProvider` reads it at root, injects CSS variables + dynamic `<link>` font tags + `<head>` SEO into `__root.tsx`. Realtime subscription so changes apply live.

### Realtime everywhere
Enable `REPLICA IDENTITY FULL` + add to `supabase_realtime` publication for: `orders`, `order_status_events`, `chat_messages`, `chat_threads`, `vendors`, `menu_items`, `app_settings`, `user_roles`, `user_permissions`, `notifications`. Provide a `useRealtimeTable` hook.

### Pages to refresh / add
- `/auth` (sign in / sign up — food-delivery copy, responsive mobile/tablet/desktop)
- `/auth/change-password` (forced on first login)
- `/admin` dashboard (orders, vendors, users, settings, chat) — gated by role + permission
- `/admin/users` (list + create + edit permissions + show generated temp password modal)
- `/admin/vendors` (approve, create, edit permissions)
- `/admin/settings` (branding/SEO/fonts/colors/logo)
- `/vendor` portal (orders, menu) — gated by vendor permissions
- Existing landing + tracking pages stay; pick up new theme tokens from `app_settings`.

### Technical notes
- All schema in one managed migration; tables get explicit `GRANT`s for `authenticated`/`service_role` per public-schema rules.
- Server fns under `src/lib/*.functions.ts`; admin user-creation fn uses `await import('@/integrations/supabase/client.server')` inside the handler and requires `super_admin` or `manage_users`.
- `_authenticated/route.tsx` managed layout gates the app; `_authenticated/_admin/route.tsx` adds role gate.

### What you'll do once
1. Approve this plan → I enable Lovable Cloud and apply the migration.
2. Sign up with `poday.developments@gmail.com` → trigger auto-grants `super_admin`.
3. From `/admin/users` create vendors/admins with temp passwords you share manually.
