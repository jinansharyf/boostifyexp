import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listZonesAll, listVehicleTypes, lookupDeliveryPrice } from "@/lib/pricing.functions";
import { createOrder } from "@/lib/orders.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/vendor/orders/new")({
  component: NewOrder,
});

function NewOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listZ = useServerFn(listZonesAll);
  const listV = useServerFn(listVehicleTypes);
  const lookup = useServerFn(lookupDeliveryPrice);
  const create = useServerFn(createOrder);

  const vendorQ = useQuery({
    queryKey: ["my-vendor-min", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, store_name").eq("owner_id", user!.id).limit(1).maybeSingle();
      return data;
    },
  });
  const zonesQ = useQuery({ queryKey: ["zones-active"], queryFn: () => listZ() });
  const vehiclesQ = useQuery({ queryKey: ["vehicles-active"], queryFn: () => listV() });

  const [form, setForm] = useState({
    pickup_zone_id: "",
    dropoff_zone_id: "",
    vehicle_type_id: "",
    customer_name: "",
    customer_phone: "",
    delivery_address: "",
    notes: "",
  });
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    setPrice(null);
    if (!form.dropoff_zone_id || !form.vehicle_type_id) return;
    lookup({ data: { zone_id: form.dropoff_zone_id, vehicle_type_id: form.vehicle_type_id } })
      .then((r: any) => setPrice(r.price))
      .catch(() => setPrice(null));
  }, [form.dropoff_zone_id, form.vehicle_type_id, lookup]);

  const m = useMutation({
    mutationFn: () => create({ data: { ...form, vendor_id: vendorQ.data!.id, notes: form.notes || null } }),
    onSuccess: (r: any) => {
      toast.success(`Order ${r.tracking_no} created`);
      navigate({ to: "/vendor/orders" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const zones = ((zonesQ.data ?? []) as any[]).filter((z) => z.active);
  const vehicles = ((vehiclesQ.data ?? []) as any[]).filter((v) => v.is_active);

  const ready = form.pickup_zone_id && form.dropoff_zone_id && form.vehicle_type_id && form.customer_name && form.customer_phone && form.delivery_address && vendorQ.data?.id;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/vendor/orders" })} className="rounded-full border px-3 py-1.5 text-xs"><ArrowLeft className="mr-1 inline h-3 w-3" /> Orders</button>
          <h1 className="font-display text-lg font-bold">New delivery</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Pickup zone</Label>
            <Select value={form.pickup_zone_id} onValueChange={(v) => setForm({ ...form, pickup_zone_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Dropoff zone</Label>
            <Select value={form.dropoff_zone_id} onValueChange={(v) => setForm({ ...form, dropoff_zone_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vehicle</Label>
            <Select value={form.vehicle_type_id} onValueChange={(v) => setForm({ ...form, vehicle_type_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-xl border bg-card px-3 py-2 text-sm">
              Price: <span className="font-bold">{price !== null ? price.toFixed(2) : "—"}</span>
              {price === 0 && <span className="ml-2 text-xs text-amber-600">no price set</span>}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Customer name</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><Label>Customer phone</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
        </div>
        <div><Label>Dropoff address</Label><Textarea value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} /></div>
        <div><Label>Notes (optional)</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

        <Button onClick={() => m.mutate()} disabled={!ready || !price || price <= 0 || m.isPending} className="w-full">Create order</Button>
      </main>
    </div>
  );
}