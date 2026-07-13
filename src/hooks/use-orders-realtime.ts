import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/app-supabase/client";

/**
 * Subscribes to any change on public.orders and invalidates the query keys
 * used by admin & staff order lists so tables auto-refresh without a manual reload.
 * Also refreshes on visibility/focus/online changes so installed PWAs pick up
 * new data after the OS suspended the websocket in the background.
 */
export function useOrdersRealtime(keys: string[] = ["admin-orders", "staff-orders", "vendor-orders"]) {
  const qc = useQueryClient();
  useEffect(() => {
    const invalidateAll = () => {
      for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
    };
    const channel = supabase
      .channel(`orders-rt-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        invalidateAll,
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") invalidateAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", invalidateAll);
    window.addEventListener("online", invalidateAll);

    // Fallback poll every 20s so installed PWAs still refresh when the
    // websocket is asleep and no visibility event fires.
    const poll = window.setInterval(invalidateAll, 20000);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", invalidateAll);
      window.removeEventListener("online", invalidateAll);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
