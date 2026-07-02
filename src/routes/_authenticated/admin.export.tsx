import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Database, FileJson, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/site/app-header";
import { exportConfig } from "@/lib/export.functions";
import { toast } from "sonner";

// Bundle every SQL file under db/ at build time so the page can serve them
// as a single concatenated schema download.
const schemaFiles = import.meta.glob("/db/**/*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const cleanFile = "/db/schema_clean.sql";

function buildSchemaSql(): string {
  const parts: string[] = [];
  parts.push("-- Boostify schema export");
  parts.push(`-- Generated: ${new Date().toISOString()}`);
  parts.push("-- Order: base schema, then migrations in filename order.");
  parts.push("");

  const entries = Object.entries(schemaFiles).filter(([p]) => !p.endsWith("dump.err"));
  const base = entries.find(([p]) => p === cleanFile) ?? entries.find(([p]) => p.endsWith("/schema.sql"));
  const migrations = entries
    .filter(([p]) => p.includes("/migrations/"))
    .sort(([a], [b]) => a.localeCompare(b));

  if (base) {
    parts.push(`-- ===== ${base[0]} =====`);
    parts.push(base[1].trim());
    parts.push("");
  }
  for (const [path, sql] of migrations) {
    parts.push(`-- ===== ${path} =====`);
    parts.push(sql.trim());
    parts.push("");
  }
  return parts.join("\n");
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ExportPage() {
  const [busy, setBusy] = useState<"schema" | "config" | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const onSchema = () => {
    setBusy("schema");
    try {
      const sql = buildSchemaSql();
      download(`boostify-schema-${stamp}.sql`, sql, "application/sql");
      toast.success("Schema downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to build schema");
    } finally {
      setBusy(null);
    }
  };

  const onConfig = async () => {
    setBusy("config");
    try {
      const bundle = await exportConfig();
      download(
        `boostify-config-${stamp}.json`,
        JSON.stringify(bundle, null, 2),
        "application/json",
      );
      toast.success("Configuration downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to export configuration");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Export" backTo="/admin" />
      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Export system</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Download your database schema and current configuration so you can
            move Boostify to another Supabase project or self-host it.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold">Database schema (SQL)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A single .sql file containing the base schema and every
                migration, in the order they should be applied to a fresh
                Postgres/Supabase database.
              </p>
              <button
                onClick={onSchema}
                disabled={busy !== null}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {busy === "schema" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download schema.sql
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <FileJson className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold">Configuration (JSON)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Site settings, email/Telegram/SMS setup, zones, prices, order
                form fields, landing content and bank accounts. Excludes users,
                orders, chats and secrets.
              </p>
              <button
                onClick={onConfig}
                disabled={busy !== null}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {busy === "config" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download config.json
              </button>
            </div>
          </div>
        </section>

        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Secrets are not exported.</p>
          <p className="mt-1">
            API keys (Resend, Owl SMS, Telegram bot, Supabase keys) live in
            environment variables. Re-create them in your destination
            environment after importing the schema and configuration.
          </p>
        </div>
      </main>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/export")({
  component: ExportPage,
});
