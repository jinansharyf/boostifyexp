import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOrders } from "@/lib/orders.functions";

type OrderRow = {
  id: string;
  tracking_no: string | null;
  status: string;
  customer_name: string;
  delivery_address: string;
  created_at: string;
};

function ensurePermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: title });
    setTimeout(() => n.close(), 8000);
  } catch { /* noop */ }
}

/**
 * Polls the user's visible orders every 15s and pops a browser notification
 * whenever a new order appears or an existing order changes status.
 */
export function useOrderBrowserNotifications(scope: "mine" | "all") {
  const list = useServerFn(listOrders);
  const seen = useRef<Map<string, string>>(new Map());
  const primed = useRef(false);

  useEffect(() => { ensurePermission(); }, []);

  const q = useQuery({
    queryKey: ["order-notif-poll", scope],
    queryFn: () => list({ data: { scope } }) as Promise<OrderRow[]>,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  useEffect(() => {
    const rows = q.data;
    if (!rows) return;
    if (!primed.current) {
      for (const r of rows) seen.current.set(r.id, r.status);
      primed.current = true;
      return;
    }
    for (const r of rows) {
      const prev = seen.current.get(r.id);
      const label = r.tracking_no ?? r.id.slice(0, 8);
      if (prev === undefined) {
        notify(`📦 New order #${label}`, `${r.customer_name} — ${r.delivery_address}`);
      } else if (prev !== r.status) {
        notify(`🔔 Order #${label} → ${r.status}`, `${r.customer_name}`);
      }
      seen.current.set(r.id, r.status);
    }
  }, [q.data]);
}