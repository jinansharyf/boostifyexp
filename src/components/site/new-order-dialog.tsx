import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/app-supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listZonesAll, listVehicleTypes, lookupDeliveryPrice } from "@/lib/pricing.functions";
import { createOrder } from "@/lib/orders.functions";
import { listOrderFields } from "@/lib/order-form-fields.functions";

export function NewOrderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listZ = useServerFn(listZonesAll);
  const listV = useServerFn(listVehicleTypes);
  const lookup = useServerFn(lookupDeliveryPrice);
  const create = useServerFn(createOrder);
  const listF = useServerFn(listOrderFields);

  const vendorQ = useQuery({
    queryKey: ["my-vendor-min", user?.id],
    enabled: !!user && open,
    queryFn: async () => {
      const { data } = await supabase.from("vendors").select("id, store_name, address, zone_id").eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });
  const zonesQ = useQuery({ queryKey: ["zones-active"], enabled: open, queryFn: () => listZ() });
  const vehiclesQ = useQuery({ queryKey: ["vehicles-active"], enabled: open, queryFn: () => listV() });
  const fieldsQ = useQuery({ queryKey: ["order-fields-active"], enabled: open, queryFn: () => listF() });

  const [form, setForm] = useState({
    dropoff_zone_id: "",
    vehicle_type_id: "",
    customer_name: "",
    customer_phone: "",
    delivery_address: "",
    notes: "",
  });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setForm({ dropoff_zone_id: "", vehicle_type_id: "", customer_name: "", customer_phone: "", delivery_address: "", notes: "" });
      setAnswers({});
      setPrice(null);
    }
  }, [open]);

  useEffect(() => {
    setPrice(null);
    if (!form.dropoff_zone_id || !form.vehicle_type_id) return;
    lookup({ data: { zone_id: form.dropoff_zone_id, vehicle_type_id: form.vehicle_type_id } })
      .then((r: any) => setPrice(r.price))
      .catch(() => setPrice(null));
  }, [form.dropoff_zone_id, form.vehicle_type_id, lookup]);

  const activeFields = useMemo(() => ((fieldsQ.data ?? []) as any[]).filter((f) => f.active), [fieldsQ.data]);
  const bySection = (s: string) => activeFields.filter((f) => f.section === s);

  const zones = ((zonesQ.data ?? []) as any[]).filter((z) => z.active);
  const vehicles = ((vehiclesQ.data ?? []) as any[]).filter((v) => v.is_active);
  const v = vendorQ.data as any;

  const m = useMutation({
    mutationFn: () => create({ data: { ...form, vendor_id: v.id, notes: form.notes || null, answers: Object.keys(answers).length ? answers : null } as any }),
    onSuccess: (r: any) => {
      toast.success(`Order ${r.tracking_no} created`);
      qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      onCreated?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const missingRequired = activeFields.some((f) => {
    const a = answers[f.field_key];
    if (!f.required) return false;
    if (f.field_type === "file") return !a?.path;
    return !String(a ?? "").trim();
  });
  const ready = !!v?.id && form.dropoff_zone_id && form.vehicle_type_id && form.customer_name && form.customer_phone && form.delivery_address && !missingRequired && price && price > 0;

  const renderField = (f: any) => {
    const val = answers[f.field_key] ?? "";
    const set = (nv: any) => setAnswers({ ...answers, [f.field_key]: nv });
    if (f.field_type === "textarea") return <Textarea value={val} onChange={(e) => set(e.target.value)} />;
    if (f.field_type === "select") return (
      <Select value={val || undefined} onValueChange={set}>
        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>{((f.options ?? []) as string[]).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    );
    return <Input type={f.field_type === "number" ? "number" : "text"} value={val} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>New delivery order</DialogTitle>
          <DialogDescription className="text-xs">Pickup is your business location. Choose the dropoff zone and vehicle to get the price.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="rounded-xl border bg-muted/40 p-3 text-sm">
            <p className="font-semibold">Pickup: {v?.store_name ?? "—"}</p>
            <p className="text-muted-foreground">{v?.address || "No business address on file — add one in Business settings."}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Dropoff zone</Label>
                <Select value={form.dropoff_zone_id} onValueChange={(v) => setForm({ ...form, dropoff_zone_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
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
            </div>
            <div className="rounded-xl border bg-card px-3 py-2 text-sm">
              Price: <span className="font-bold">{price !== null ? price.toFixed(2) : "—"}</span>
              {form.dropoff_zone_id && form.vehicle_type_id && price === 0 && <span className="ml-2 text-xs text-amber-600">no price set for this combo</span>}
            </div>
            <div><Label>Dropoff address</Label><Textarea rows={2} value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} /></div>
            {bySection("delivery").map((f) => (
              <div key={f.id}><Label>{f.label}{f.required && <span className="text-red-600"> *</span>}</Label>{renderField(f)}</div>
            ))}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>Name</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
            </div>
            {bySection("customer").map((f) => (
              <div key={f.id}><Label>{f.label}{f.required && <span className="text-red-600"> *</span>}</Label>{renderField(f)}</div>
            ))}
          </section>

          {bySection("other").length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More</h3>
              {bySection("other").map((f) => (
                <div key={f.id}><Label>{f.label}{f.required && <span className="text-red-600"> *</span>}</Label>{renderField(f)}</div>
              ))}
            </section>
          )}

          <div><Label>Notes (optional)</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>

        <DialogFooter className="border-t px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={!ready || m.isPending}>{m.isPending ? "Creating…" : "Create order"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
