import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/app-supabase/client";

/**
 * Subscribes to any change on public.orders and invalidates the query keys
 * used by admin & staff order lists so tables auto-refresh without a manual reload.
 */
export function useOrdersRealtime(keys: string[] = ["admin-orders", "staff-orders", "vendor-orders"]) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`orders-rt-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
