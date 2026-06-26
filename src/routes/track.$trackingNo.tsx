import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PublicShell } from "@/components/site/public-shell";
import { supabase } from "@/integrations/app-supabase/client";
import type { Database } from "@/integrations/app-supabase/types";

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
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "picked_up", label: "Picked up" },
  { key: "on_the_way", label: "On the way" },
  { key: "delivered", label: "Delivered" },
];

function TrackPage() {
  const { trackingNo } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tracking", trackingNo],
    queryFn: async () => {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, tracking_no, status, created_at, updated_at, vendor_id, vendors(store_name), zones(name)")
        .eq("tracking_no", trackingNo)
        .maybeSingle();
      if (orderError) throw orderError;
      if (!order) return { order: null, events: [] as { status: OrderStatus; note: string | null; created_at: string }[] };
      const { data: events, error: evErr } = await supabase
        .from("order_status_events")
        .select("status, note, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true });
      if (evErr) throw evErr;
      return { order, events: events ?? [] };
    },
  });

  return (
    <PublicShell>
      <section className="mx-auto max-w-3xl px-4 py-10">
        <Link to="/track" className="text-sm text-muted-foreground hover:text-foreground">
          ← Track another
        </Link>
        <div className="mt-4 rounded-3xl border border-border bg-card p-6 md:p-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tracking</p>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{trackingNo}</h1>

          {isLoading && <p className="mt-6 text-muted-foreground">Loading…</p>}
          {error && <p className="mt-6 text-destructive">Could not load tracking. Please try again.</p>}
          {!isLoading && !error && !data?.order && (
            <div className="mt-6 rounded-2xl bg-secondary/60 p-6 text-center">
              <p className="font-semibold">No order found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Double-check the tracking number and try again.
              </p>
            </div>
          )}

          {data?.order && (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Info label="Kitchen" value={data.order.vendors?.store_name ?? "—"} />
                <Info label="Zone" value={data.order.zones?.name ?? "—"} />
                <Info
                  label="Status"
                  value={STAGES.find((s) => s.key === data.order!.status)?.label ?? data.order.status}
                />
              </div>

              <div className="mt-8">
                <h2 className="font-display text-lg font-semibold">Timeline</h2>
                <ol className="mt-4 space-y-4">
                  {STAGES.map((s) => {
                    const event = data.events.find((e) => e.status === s.key);
                    const reached = !!event;
                    return (
                      <li key={s.key} className="flex gap-3">
                        <span
                          className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                            reached
                              ? "bg-primary text-primary-foreground"
                              : "border border-border bg-background text-muted-foreground"
                          }`}
                        >
                          {reached ? "✓" : "·"}
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
            </>
          )}
        </div>
      </section>
    </PublicShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
