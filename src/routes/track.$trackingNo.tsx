import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/site/public-shell";
import { supabase } from "@/integrations/app-supabase/client";
import type { Database } from "@/integrations/app-supabase/types";
import { StatusBadge, STATUS_LABEL, type OrderStatus as OrderStatusT } from "@/components/site/order-status";
import { escapePostgrestPattern, extractTrackingNo } from "@/lib/tracking";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export const Route = createFileRoute("/track/$trackingNo")({
  head: ({ params }) => ({
    meta: [
      { title: `Tracking ${params.trackingNo} — Boostify` },
      { name: "description", content: `Live status for Boostify order ${params.trackingNo}.` },
    ],
  }),
  component: TrackPage,
});

const STAGES: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Order placed" },
  { key: "accepted", label: "Approved" },
  { key: "picked_up", label: "Picked up" },
  { key: "delivered", label: "Delivered" },
];

const STAGE_ICON: Record<string, string> = {
  pending: "📝",
  accepted: "✅",
  picked_up: "🛵",
  delivered: "📦",
};

const ORDER_SELECT = "id, tracking_no, status, created_at, updated_at, vendor_id, vendors(store_name), zones!orders_zone_id_fkey(name)";
const ORDER_SELECT_MINIMAL = "id, tracking_no, status, created_at, updated_at, vendor_id, zone_id";

async function findOrderByTracking(select: string, trackingNo: string) {
  const exact = await supabase
    .from("orders")
    .select(select)
    .eq("tracking_no", trackingNo)
    .maybeSingle();
  if (exact.error) throw exact.error;
  if (exact.data) return exact.data;

  const insensitive = await supabase
    .from("orders")
    .select(select)
    .ilike("tracking_no", trackingNo)
    .maybeSingle();
  if (insensitive.error) throw insensitive.error;
  if (insensitive.data) return insensitive.data;

  if (trackingNo.length >= 10) {
    const prefix = await supabase
      .from("orders")
      .select(select)
      .ilike("tracking_no", `${escapePostgrestPattern(trackingNo)}%`)
      .limit(2);
    if (prefix.error) throw prefix.error;
    if ((prefix.data ?? []).length === 1) return prefix.data![0];
  }

  return null;
}

function TrackPage() {
  const { trackingNo } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tracking", trackingNo],
    queryFn: async () => {
      const trimmed = extractTrackingNo(trackingNo ?? "");
      let order: any = null;
      try {
        order = await findOrderByTracking(ORDER_SELECT, trimmed);
      } catch {
        order = await findOrderByTracking(ORDER_SELECT_MINIMAL, trimmed);
      }
      if (!order) return { order: null, events: [] as { status: OrderStatus; note: string | null; created_at: string }[] };
      const { data: events, error: evErr } = await supabase
        .from("order_status_events")
        .select("status, note, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true });
      const safeEvents = evErr ? [] : (events ?? []);
      const { data: settings } = await supabase
        .from("app_settings")
        .select("contact_phone, site_name, logo_url")
        .eq("id", 1)
        .maybeSingle();
      return {
        order,
        events: safeEvents,
        contactPhone: (settings as any)?.contact_phone as string | null,
        siteName: (settings as any)?.site_name as string | null,
        logoUrl: (settings as any)?.logo_url as string | null,
      };
    },
  });

  const order = data?.order;
  const displayTracking = order?.tracking_no ?? extractTrackingNo(trackingNo ?? "") ?? trackingNo;
  const status = (order?.status ?? "pending") as OrderStatusT;
  const reachedIdx = (() => {
    if (status === "delivered") return 3;
    if (status === "picked_up" || status === "on_the_way") return 2;
    if (status === "accepted" || status === "preparing") return 1;
    if (status === "cancelled" || status === "rejected") return -1;
    return 0;
  })();
  const progressPct = reachedIdx < 0 ? 0 : Math.min(100, ((reachedIdx) / (STAGES.length - 1)) * 100);

  return (
    <PublicShell>
      <section className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/track" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          ← Track another order
        </Link>

        {/* Hero card with gradient + logo */}
        <div className="mt-4 overflow-hidden rounded-[28px] border border-border bg-card shadow-lg">
          <div
            className="relative px-6 pt-8 pb-10 text-white"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent, var(--primary))) 100%)",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {data?.logoUrl ? (
                  <img src={data.logoUrl} alt="" className="h-8 w-8 rounded-lg bg-white/20 p-1 object-contain" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-lg">⚡</span>
                )}
                <span className="text-sm font-semibold tracking-wide opacity-90">
                  {data?.siteName ?? "Delivery"}
                </span>
              </div>
              {order && <StatusBadgeInverted status={order.status} />}
            </div>

            <p className="mt-6 text-[11px] uppercase tracking-[0.2em] opacity-75">Tracking</p>
            <h1 className="font-display mt-1 select-all break-all text-2xl font-bold leading-tight md:text-3xl">
              {displayTracking}
            </h1>

            {order && (
              <div className="mt-6">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-between text-[10px] uppercase tracking-wider opacity-80">
                  {STAGES.map((s, i) => (
                    <span key={s.key} className={i <= reachedIdx ? "font-semibold opacity-100" : ""}>
                      {STAGE_ICON[s.key]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 md:p-8">
            {isLoading && (
              <div className="space-y-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            )}
            {error && <p className="text-destructive">Could not load tracking. Please try again.</p>}
            {!isLoading && !error && !order && (
              <div className="rounded-2xl bg-secondary/60 p-6 text-center">
                <p className="text-3xl">🔎</p>
                <p className="mt-2 font-semibold">No order found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Double-check the tracking number and try again.
                </p>
                <Link
                  to="/track"
                  className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Try another
                </Link>
              </div>
            )}

            {order && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon="🍽" label="Kitchen" value={order.vendors?.store_name ?? "—"} />
                  <Info icon="📍" label="Zone" value={order.zones?.name ?? "—"} />
                </div>

                <div className="mt-6">
                  <h2 className="font-display text-base font-semibold">Timeline</h2>
                  <ol className="mt-4 relative">
                    <span
                      aria-hidden
                      className="absolute left-[11px] top-2 bottom-2 w-px bg-border"
                    />
                    {STAGES.map((s, i) => {
                      const event = data?.events.find((e) => e.status === s.key);
                      const reached = i <= reachedIdx;
                      return (
                        <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                          <span
                            className={`z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                              reached
                                ? "bg-primary text-primary-foreground shadow"
                                : "border border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {reached ? "✓" : i + 1}
                          </span>
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                              {s.label}
                            </p>
                            {event?.created_at && (
                              <p className="text-xs text-muted-foreground">
                                {new Date(event.created_at).toLocaleString()}
                              </p>
                            )}
                            {event?.note && <p className="text-xs text-muted-foreground">{event.note}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                {data?.contactPhone && (
                  <a
                    href={`tel:${data.contactPhone}`}
                    className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-background p-4 transition hover:border-primary"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Need help?</p>
                      <p className="mt-0.5 text-sm font-semibold">
                        Call {data.siteName ?? "us"} — {data.contactPhone}
                      </p>
                    </div>
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-lg text-primary-foreground">📞</span>
                  </a>
                )}

                <p className="mt-6 text-center text-[11px] text-muted-foreground">
                  Powered by {data?.siteName ?? "our delivery system"}
                </p>
              </>
            )}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function Info({ icon, label, value }: { icon?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4">
      {icon && <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-base">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function StatusBadgeInverted({ status }: { status: string }) {
  const key = (status in STATUS_LABEL ? status : "pending") as OrderStatusT;
  return (
    <span className="inline-flex items-center rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
      {STATUS_LABEL[key]}
    </span>
  );
}
