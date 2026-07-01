import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { runSetupChecks, type CheckResult } from "@/lib/setup-check.functions";

// Ordered migration SQL — bundled as raw strings at build time.
import sql0002 from "../../../db/migrations/0002_partner_applications.sql?raw";
import sql0003 from "../../../db/migrations/0003_storage_policies.sql?raw";
import sql0004 from "../../../db/migrations/0004_chat_delete_policy.sql?raw";
import sql0005 from "../../../db/migrations/0005_chat_images_and_search.sql?raw";
import sql0006 from "../../../db/migrations/0006_password_reset_rate_limit.sql?raw";
import sql0007 from "../../../db/migrations/0007_orders_billing.sql?raw";
import sql0008 from "../../../db/migrations/0008_landing_telegram_pwa.sql?raw";
import sql0009 from "../../../db/migrations/0009_billing_cycle.sql?raw";
import sql0010 from "../../../db/migrations/0010_order_form_fields.sql?raw";
import sql0011 from "../../../db/migrations/0011_staff_roles.sql?raw";
import sql0012 from "../../../db/migrations/0012_staff_notifications.sql?raw";
import sql0013 from "../../../db/migrations/0013_vendor_location.sql?raw";

type Step = {
  file: string;
  label: string;
  sql: string;
  /** keys from setup checks that this migration satisfies */
  satisfies: string[];
};

const STEPS: Step[] = [
  { file: "0002_partner_applications.sql", label: "Partner applications", sql: sql0002, satisfies: ["0002"] },
  { file: "0003_storage_policies.sql", label: "Storage policies (avatars / vendor-assets)", sql: sql0003, satisfies: [] },
  { file: "0004_chat_delete_policy.sql", label: "Chat delete policy", sql: sql0004, satisfies: [] },
  { file: "0005_chat_images_and_search.sql", label: "Chat images + admin search", sql: sql0005, satisfies: ["0005"] },
  { file: "0006_password_reset_rate_limit.sql", label: "Password reset rate limit", sql: sql0006, satisfies: ["0006"] },
  { file: "0007_orders_billing.sql", label: "Orders + billing + pricing", sql: sql0007, satisfies: ["0007a", "0007b", "0007c", "0007d", "0007e"] },
  { file: "0008_landing_telegram_pwa.sql", label: "Landing / Telegram / PWA push", sql: sql0008, satisfies: ["0008a", "0008b", "0008c"] },
  { file: "0009_billing_cycle.sql", label: "Vendor billing cycle", sql: sql0009, satisfies: ["0009"] },
  { file: "0010_order_form_fields.sql", label: "Order form fields", sql: sql0010, satisfies: ["0010"] },
  { file: "0011_staff_roles.sql", label: "Delivery staff roles + zones", sql: sql0011, satisfies: ["0011a", "0011b"] },
  { file: "0012_staff_notifications.sql", label: "Staff notifications (Telegram chat)", sql: sql0012, satisfies: ["0012"] },
  { file: "0013_vendor_location.sql", label: "Vendor geolocation (lat/lng)", sql: sql0013, satisfies: ["0013"] },
];

export const Route = createFileRoute("/_authenticated/admin/setup")({
  component: SetupPage,
});

function SetupPage() {
  const run = useServerFn(runSetupChecks);
  const q = useQuery({
    queryKey: ["setup-checks"],
    queryFn: () => run() as Promise<CheckResult[]>,
  });
  const rerun = useMutation({
    mutationFn: () => run() as Promise<CheckResult[]>,
    onSuccess: () => q.refetch(),
  });

  const byKey = new Map((q.data ?? []).map((r) => [r.key, r]));
  const stepStatus = (s: Step): "ok" | "missing" | "unknown" => {
    if (!s.satisfies.length) return "unknown";
    const rs = s.satisfies.map((k) => byKey.get(k)).filter(Boolean) as CheckResult[];
    if (!rs.length) return "unknown";
    return rs.every((r) => r.ok) ? "ok" : "missing";
  };

  const copy = async (sql: string, file: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      toast.success(`Copied ${file}`);
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  };

  const totalMissing = (q.data ?? []).filter((r) => !r.ok).length;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Database setup</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Checks required tables and columns in your Supabase project, then gives you the SQL to paste in the SQL Editor — in the right order.
          </p>
        </div>
        <Button variant="outline" onClick={() => rerun.mutate()} disabled={rerun.isPending || q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          Re-check
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
          <CardDescription>
            {q.isLoading
              ? "Checking…"
              : q.isError
              ? "Failed to run checks."
              : totalMissing === 0
              ? "All required tables and columns are present."
              : `${totalMissing} check(s) failed — apply the SQL steps below in order.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {(q.data ?? []).map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                {r.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.table}
                    {r.missing.length > 0 && ` — missing: ${r.missing.join(", ")}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">SQL steps (run in order)</h2>
        <p className="text-sm text-muted-foreground">
          Open your Supabase project → SQL Editor → paste each block and run. Each script is safe to re-run (uses <code>if not exists</code> / <code>drop policy if exists</code>).
        </p>
        {STEPS.map((s, i) => {
          const status = stepStatus(s);
          return (
            <Card key={s.file}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Step {i + 1}.</span>
                    <span className="truncate">{s.label}</span>
                    {status === "ok" && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> applied
                      </span>
                    )}
                    {status === "missing" && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600">
                        <XCircle className="h-3.5 w-3.5" /> needs to run
                      </span>
                    )}
                    {status === "unknown" && (
                      <span className="text-xs text-muted-foreground">no check</span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">{s.file}</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(s.sql, s.file)}>
                  <Copy className="h-4 w-4" /> Copy SQL
                </Button>
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                    Show SQL ({s.sql.split("\n").length} lines)
                  </summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                    <code>{s.sql}</code>
                  </pre>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
