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

const StageIcon = ({ status, className = "h-4 w-4" }: { status: string; className?: string }) => {
  const common = { className, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (status) {
    case "pending":
      return (<svg viewBox="0 0 24 24" {...common}><path d="M9 4h6l1 3h3v13H5V7h3l1-3Z"/><path d="M9 12h6M9 16h4"/></svg>);
    case "accepted":
      return (<svg viewBox="0 0 24 24" {...common}><path d="M20 6 9 17l-5-5"/></svg>);
    case "picked_up":
      return (<svg viewBox="0 0 24 24" {...common}><circle cx="6" cy="18" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M3 7h7l3 8M13 7h4l3 5v6h-2"/></svg>);
    case "delivered":
      return (<svg viewBox="0 0 24 24" {...common}><path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>);
    default:
      return null;
  }
};

const ORDER_SELECT = "id, tracking_no, status, created_at, updated_at, vendor_id, vendors(store_name), zones!orders_zone_id_fkey(name)";
const ORDER_SELECT_MINIMAL = "id, tracking_no, status, created_at, updated_at, vendor_id, zone_id";

async function findOrderByTracking(select: string, trackingNo: string) {
  const pattern = trackingNo.length >= 10 ? `${escapePostgrestPattern(trackingNo)}%` : trackingNo;
  const matches = await supabase
    .from("orders")
    .select(select)
    .ilike("tracking_no", pattern)
    .limit(2);
  if (matches.error) throw matches.error;

  const rows = matches.data ?? [];
  const exact = rows.find((row: any) => String(row.tracking_no).toUpperCase() === trackingNo);
  if (exact) return exact;
  if (rows.length === 1) return rows[0];

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
    if (status === "accepted" || status === "preparing" || status === "ready_for_pickup") return 1;
    if (status === "cancelled" || status === "rejected") return -1;
    return 0;
  })();
  const progressPct = reachedIdx < 0 ? 0 : Math.min(100, (reachedIdx / (STAGES.length - 1)) * 100);
  const isTerminated = status === "cancelled" || status === "rejected";

  return (
    <PublicShell>
      <section className="mx-auto max-w-xl px-4 pb-10 pt-6 md:pt-10">
        <Link
          to="/track"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Track another
        </Link>

        {/* Hero */}
        <div className="relative mt-4 overflow-hidden rounded-[32px] p-6 text-primary-foreground shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--primary)_60%,transparent)] md:p-8"
          style={{ background: "linear-gradient(140deg, var(--forest) 0%, var(--primary) 55%, var(--bolt) 120%)" }}
        >
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-black/20 blur-3xl" />

          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {data?.logoUrl ? (
                <img src={data.logoUrl} alt="" className="h-9 w-9 rounded-xl bg-white/25 p-1.5 object-contain backdrop-blur" />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/25 backdrop-blur">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M13.2 2 4 13.6h6.1L9 22l10.4-12.4h-6.4L13.2 2Z"/></svg>
                </span>
              )}
              <span className="text-sm font-semibold tracking-wide">{data?.siteName ?? "Delivery"}</span>
            </div>
            {order && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${isTerminated ? "bg-rose-300" : "bg-emerald-300 animate-pulse"}`} />
                {STATUS_LABEL[(order.status in STATUS_LABEL ? order.status : "pending") as OrderStatusT]}
              </span>
            )}
          </div>

          <div className="relative mt-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] opacity-80">Tracking number</p>
            <h1 className="font-display mt-1.5 select-all break-all text-[26px] font-bold leading-tight md:text-3xl">
              {displayTracking}
            </h1>
          </div>

          {order && !isTerminated && (
            <div className="relative mt-8">
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white/90 transition-all duration-700" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-4">
                {STAGES.map((s, i) => {
                  const reached = i <= reachedIdx;
                  return (
                    <div key={s.key} className="flex flex-col items-center gap-1.5">
                      <span className={`grid h-9 w-9 place-items-center rounded-full border transition ${reached ? "border-white/60 bg-white text-primary" : "border-white/30 bg-white/10 text-white/70"}`}>
                        <StageIcon status={s.key} className="h-4 w-4" />
                      </span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${reached ? "opacity-100" : "opacity-60"}`}>
                        {s.label.split(" ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="mt-5">
          {isLoading && (
            <div className="space-y-3 rounded-3xl border border-border bg-card p-6">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            </div>
          )}
          {error && (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              Could not load tracking. Please try again.
            </div>
          )}
          {!isLoading && !error && !order && (
            <div className="rounded-3xl border border-border bg-card p-8 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              </span>
              <p className="mt-4 font-display text-lg font-semibold">No order found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Double-check the tracking number and try again.
              </p>
              <Link
                to="/track"
                className="mt-5 inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition active:scale-95"
              >
                Try another
              </Link>
            </div>
          )}

          {order && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Kitchen" value={order.vendors?.store_name ?? "—"}
                  icon={(<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v7a3 3 0 0 0 6 0V2M9 2v6M17 2c1.5.8 2.5 3 2.5 5.5S18.5 12 17 12v10"/></svg>)} />
                <Info label="Delivery zone" value={order.zones?.name ?? "—"}
                  icon={(<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-7-7.5-7-13a7 7 0 1 1 14 0c0 5.5-7 13-7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>)} />
              </div>

              <div className="mt-5 rounded-3xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold">Timeline</h2>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Live</span>
                </div>
                <ol className="relative mt-5">
                  <span aria-hidden className="absolute left-[17px] top-3 bottom-3 w-px bg-border" />
                  {STAGES.map((s, i) => {
                    const event = data?.events.find((e) => e.status === s.key);
                    const reached = i <= reachedIdx;
                    const current = i === reachedIdx && !isTerminated;
                    return (
                      <li key={s.key} className="relative flex gap-3.5 pb-6 last:pb-0">
                        <span
                          className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold transition ${
                            reached
                              ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
                              : "border border-border bg-background text-muted-foreground"
                          }`}
                        >
                          <StageIcon status={s.key} className="h-4 w-4" />
                          {current && (
                            <span aria-hidden className="absolute inset-0 -z-0 animate-ping rounded-full bg-primary/40" />
                          )}
                        </span>
                        <div className="flex-1 pt-1">
                          <p className={`text-sm font-semibold ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                            {s.label}
                          </p>
                          {event?.created_at ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(event.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-muted-foreground/70">Waiting…</p>
                          )}
                          {event?.note && <p className="mt-1 text-xs text-muted-foreground">{event.note}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {data?.contactPhone && (
                <a
                  href={`tel:${data.contactPhone}`}
                  className="mt-4 flex items-center justify-between gap-3 rounded-3xl border border-border bg-card p-5 transition hover:border-primary/60 active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Need help?</p>
                    <p className="mt-0.5 truncate text-sm font-semibold">Call {data.siteName ?? "support"}</p>
                    <p className="text-xs text-muted-foreground">{data.contactPhone}</p>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent)]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"/></svg>
                  </span>
                </a>
              )}

              <p className="mt-6 text-center text-[11px] text-muted-foreground">
                Powered by {data?.siteName ?? "our delivery network"}
              </p>
            </>
          )}
        </div>
      </section>
    </PublicShell>
  );
}

function Info({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
      {icon && <span className="grid h-10 w-10 place-items-center rounded-2xl bg-secondary text-foreground/70">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
