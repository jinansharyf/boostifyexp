import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/app-supabase/client";
import {
  listZonesAll,
  upsertZone,
  deleteZone,
  listVehicleTypes,
  upsertVehicleType,
  deleteVehicleType,
  listDeliveryPrices,
  setDeliveryPrice,
} from "@/lib/pricing.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (!list.includes("admin") && !list.includes("super_admin")) {
      throw new Error("Forbidden");
    }
  },
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <button onClick={() => navigate({ to: "/admin" })} className="rounded-full border px-3 py-1.5 text-xs">
            <ArrowLeft className="mr-1 inline h-3 w-3" /> Admin
          </button>
          <h1 className="font-display text-lg font-bold">Pricing</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="matrix">
          <TabsList>
            <TabsTrigger value="matrix">Price matrix</TabsTrigger>
            <TabsTrigger value="zones">Zones</TabsTrigger>
            <TabsTrigger value="vehicles">Vehicle types</TabsTrigger>
          </TabsList>
          <TabsContent value="matrix" className="mt-4"><MatrixTab /></TabsContent>
          <TabsContent value="zones" className="mt-4"><ZonesTab /></TabsContent>
          <TabsContent value="vehicles" className="mt-4"><VehiclesTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ZonesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listZonesAll);
  const save = useServerFn(upsertZone);
  const del = useServerFn(deleteZone);
  const q = useQuery({ queryKey: ["pricing-zones"], queryFn: () => list() });
  const [form, setForm] = useState({ name: "", flat_fee: 0, eta_minutes: 30 });
  const m = useMutation({
    mutationFn: (input: any) => save({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["pricing-zones"] });
      setForm({ name: "", flat_fee: 0, eta_minutes: 30 });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const dm = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-zones"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <Input placeholder="Zone name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="max-w-xs" />
        <Input type="number" placeholder="Flat fee" value={form.flat_fee} onChange={(e) => setForm({ ...form, flat_fee: Number(e.target.value) })} className="w-32" />
        <Input type="number" placeholder="ETA mins" value={form.eta_minutes} onChange={(e) => setForm({ ...form, eta_minutes: Number(e.target.value) })} className="w-28" />
        <Button onClick={() => form.name && m.mutate({ ...form, active: true })} disabled={m.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Add zone
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Name</TableHead><TableHead>Flat fee</TableHead><TableHead>ETA</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {(q.data ?? []).map((z: any) => (
            <ZoneRow key={z.id} zone={z} onSave={(d: any) => m.mutate(d)} onDelete={() => dm.mutate(z.id)} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ZoneRow({ zone, onSave, onDelete }: any) {
  const [edit, setEdit] = useState(zone);
  return (
    <TableRow>
      <TableCell><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></TableCell>
      <TableCell><Input type="number" value={edit.flat_fee} onChange={(e) => setEdit({ ...edit, flat_fee: Number(e.target.value) })} className="w-28" /></TableCell>
      <TableCell><Input type="number" value={edit.eta_minutes} onChange={(e) => setEdit({ ...edit, eta_minutes: Number(e.target.value) })} className="w-24" /></TableCell>
      <TableCell><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={() => onSave(edit)}><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3 w-3 text-destructive" /></Button>
      </TableCell>
    </TableRow>
  );
}

function VehiclesTab() {
  const qc = useQueryClient();
  const list = useServerFn(listVehicleTypes);
  const save = useServerFn(upsertVehicleType);
  const del = useServerFn(deleteVehicleType);
  const q = useQuery({ queryKey: ["pricing-vehicles"], queryFn: () => list() });
  const [form, setForm] = useState({ name: "", code: "" });
  const m = useMutation({
    mutationFn: (input: any) => save({ data: input }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["pricing-vehicles"] });
      setForm({ name: "", code: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const dm = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-vehicles"] }),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <Input placeholder="Name (Bike)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="max-w-xs" />
        <Input placeholder="Code (bike)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="max-w-xs" />
        <Button onClick={() => form.name && form.code && m.mutate({ ...form, is_active: true })}><Plus className="mr-1 h-4 w-4" /> Add</Button>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {(q.data ?? []).map((v: any) => (
            <VehicleRow key={v.id} v={v} onSave={(d: any) => m.mutate(d)} onDelete={() => dm.mutate(v.id)} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function VehicleRow({ v, onSave, onDelete }: any) {
  const [edit, setEdit] = useState(v);
  return (
    <TableRow>
      <TableCell><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></TableCell>
      <TableCell><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} className="w-32" /></TableCell>
      <TableCell><Switch checked={edit.is_active} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} /></TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={() => onSave(edit)}><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3 w-3 text-destructive" /></Button>
      </TableCell>
    </TableRow>
  );
}

function MatrixTab() {
  const qc = useQueryClient();
  const listZ = useServerFn(listZonesAll);
  const listV = useServerFn(listVehicleTypes);
  const listP = useServerFn(listDeliveryPrices);
  const setP = useServerFn(setDeliveryPrice);
  const zonesQ = useQuery({ queryKey: ["pricing-zones"], queryFn: () => listZ() });
  const vehiclesQ = useQuery({ queryKey: ["pricing-vehicles"], queryFn: () => listV() });
  const pricesQ = useQuery({ queryKey: ["pricing-matrix"], queryFn: () => listP() });

  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of (pricesQ.data ?? []) as any[]) m.set(`${p.zone_id}:${p.vehicle_type_id}`, Number(p.price_per_delivery));
    return m;
  }, [pricesQ.data]);

  const m = useMutation({
    mutationFn: (i: any) => setP({ data: i }),
    onSuccess: () => {
      toast.success("Price saved");
      qc.invalidateQueries({ queryKey: ["pricing-matrix"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const zones = (zonesQ.data ?? []) as any[];
  const vehicles = (vehiclesQ.data ?? []) as any[];

  if (zones.length === 0 || vehicles.length === 0) {
    return <p className="text-sm text-muted-foreground">Add at least one zone and one vehicle type first.</p>;
  }

  return (
    <div className="overflow-auto rounded-xl border bg-card p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zone \ Vehicle</TableHead>
            {vehicles.map((v) => <TableHead key={v.id}>{v.name}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {zones.map((z) => (
            <TableRow key={z.id}>
              <TableCell className="font-medium">{z.name}</TableCell>
              {vehicles.map((v) => (
                <TableCell key={v.id}>
                  <PriceInput
                    defaultValue={priceMap.get(`${z.id}:${v.id}`) ?? 0}
                    onSave={(val) => m.mutate({ zone_id: z.id, vehicle_type_id: v.id, price_per_delivery: val })}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PriceInput({ defaultValue, onSave }: { defaultValue: number; onSave: (n: number) => void }) {
  const [val, setVal] = useState<string>(String(defaultValue ?? 0));
  return (
    <div className="flex items-center gap-1">
      <Input value={val} onChange={(e) => setVal(e.target.value)} className="w-24" type="number" step="0.01" />
      <Button size="sm" variant="outline" onClick={() => onSave(Number(val))}><Save className="h-3 w-3" /></Button>
    </div>
  );
}