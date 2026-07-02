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
          <CardTitle>2. Run the schema</CardTitle>
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
          <CardTitle>3. Set environment variables on Vercel</CardTitle>
          <CardDescription>
            Project → Settings → Environment Variables. Add these for Production &amp; Preview,
            then redeploy.
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
          <EnvRow name="LOVABLE_API_KEY" desc="Optional — leave unset if not using Lovable AI" />
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
    </div>
  );
}