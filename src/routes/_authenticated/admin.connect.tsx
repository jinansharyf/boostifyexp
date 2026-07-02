import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/connect")({
  component: ConnectPage,
});

function EnvRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <code className="text-sm font-semibold">{name}</code>
      <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

function ConnectPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Connect your own Supabase</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This system is hosted on Vercel. Follow the steps below to point it at a Supabase
          project you own.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Create a Supabase project</CardTitle>
          <CardDescription>Go to supabase.com → New project. Save the database password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>From <strong>Project Settings → API</strong> collect:</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Project URL</li>
            <li>Publishable (anon) key</li>
            <li>Service role key (keep secret — server only)</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Set environment variables on Vercel</CardTitle>
          <CardDescription>
            Project → Settings → Environment Variables. Add these for Production &amp; Preview,
            then redeploy so the app connects to your new Supabase before you load the schema.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <EnvRow name="VITE_SUPABASE_URL" desc="https://<project-ref>.supabase.co" />
          <EnvRow name="VITE_SUPABASE_PUBLISHABLE_KEY" desc="Publishable / anon key" />
          <EnvRow name="VITE_SUPABASE_PROJECT_ID" desc="Your project ref (subdomain of the URL)" />
          <EnvRow name="SUPABASE_URL" desc="Same URL as above (server-side)" />
          <EnvRow name="SUPABASE_PUBLISHABLE_KEY" desc="Same publishable key (server-side)" />
          <EnvRow name="SUPABASE_SERVICE_ROLE_KEY" desc="Service role key — server only, never expose" />
          <EnvRow name="APP_SUPABASE_SERVICE_ROLE_KEY" desc="Same service role key (used by admin server functions)" />
          <EnvRow name="RESEND_API_KEY" desc="Optional — for transactional email" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Run the schema</CardTitle>
          <CardDescription>Apply the base schema and every migration in order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>In the Supabase SQL editor run, in this order:</p>
          <ol className="list-decimal pl-5 text-muted-foreground">
            <li><code>db/schema.sql</code></li>
            <li>Every file in <code>db/migrations/</code> sorted by filename (0002, 0003, …)</li>
          </ol>
          <p className="text-muted-foreground">
            Or use the <strong>Database setup</strong> page in the admin dashboard to copy each
            migration one at a time.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Configure Supabase Auth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            In <strong>Authentication → URL Configuration</strong>, set the Site URL to your
            Vercel domain (e.g. <code>https://your-app.vercel.app</code>) and add it to the
            Redirect Allow List along with any custom domain.
          </p>
          <p>
            Enable Email/Password. Optionally enable Google OAuth and add the same domain to
            the authorized callback list.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Seed the first super admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Sign up in the app with your email, then run in the SQL editor:</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users
where email = 'you@example.com'
on conflict do nothing;`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Redeploy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Trigger a fresh Vercel deployment so the new env vars are picked up. Visit
          <code> /admin/setup</code> to verify all required tables exist.
        </CardContent>
      </Card>

      <div className="pt-4">
        <h2 className="text-xl font-bold">Optional: migrate existing data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The steps above create an empty database. If you want to keep current users,
          vendors, orders, chat history, uploaded files and order-number counters, run the
          migration below <strong>after</strong> the schema is loaded and <strong>before</strong>
          real users sign up on the new project.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>A. Dump the current database</CardTitle>
          <CardDescription>Run on your machine. You need the source DB connection string.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Grab the connection string from the source project → <strong>Project Settings → Database → Connection string (URI)</strong>.</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`# data only — schema is already loaded on the new project
pg_dump \\
  --data-only \\
  --no-owner --no-privileges \\
  --schema=public --schema=auth --schema=storage \\
  --exclude-table-data='auth.schema_migrations' \\
  --exclude-table-data='storage.migrations' \\
  "postgresql://postgres:PASSWORD@db.OLD-REF.supabase.co:5432/postgres" \\
  > backup.sql`}
          </pre>
          <p>
            Dumping <code>auth</code> preserves logins (users keep their passwords / OAuth links).
            Dumping <code>storage</code> preserves the file metadata rows — the actual files
            still need to be copied in step C.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>B. Restore into the new project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`psql \\
  "postgresql://postgres:PASSWORD@db.NEW-REF.supabase.co:5432/postgres" \\
  -v ON_ERROR_STOP=1 \\
  -f backup.sql`}
          </pre>
          <p>
            If you hit duplicate-key errors on <code>auth.users</code>, the new project already
            has accounts — delete them from <strong>Authentication → Users</strong> and rerun.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>C. Copy storage files</CardTitle>
          <CardDescription>Buckets: <code>avatars</code>, <code>vendor-assets</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Install the Supabase CLI, then for each bucket:</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`# download from old
supabase storage cp -r \\
  --experimental \\
  ss:///avatars ./avatars \\
  --project-ref OLD-REF

# upload to new
supabase storage cp -r \\
  --experimental \\
  ./avatars ss:///avatars \\
  --project-ref NEW-REF

# repeat for vendor-assets`}
          </pre>
          <p>
            Alternative: use <a className="underline" href="https://supabase.com/docs/guides/platform/migrating-and-upgrading-projects" target="_blank" rel="noreferrer">Supabase's migration guide</a> or a small script using the Storage API if the CLI copy fails on large buckets.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>D. Reconfigure OAuth &amp; integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ul className="list-disc pl-5">
            <li>Google OAuth: paste Client ID / Secret in the new project under Auth → Providers → Google, and add the new callback URL to Google Cloud Console.</li>
            <li>Resend, Owl SMS, Telegram bot token, business bank details, SMS templates: these live in <code>app_settings</code> / <code>telegram_settings</code> / <code>email_settings</code> and come across with the data dump — verify them in <code>/admin/settings</code>.</li>
            <li>Order numbering: <code>order_number_counters</code> is included in the dump, so new orders continue the sequence.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}