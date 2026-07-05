import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PublicShell } from "@/components/site/public-shell";
import { extractTrackingNo } from "@/lib/tracking";

export const Route = createFileRoute("/track/")({
  head: () => ({
    meta: [
      { title: "Track your parcel — Boostify" },
      { name: "description", content: "Enter your Boostify tracking number to follow your parcel in real time." },
    ],
  }),
  component: TrackEntry,
});

function TrackEntry() {
  const navigate = useNavigate();
  const [tn, setTn] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = extractTrackingNo(tn);
    if (!v) return;
    navigate({ to: "/track/$trackingNo", params: { trackingNo: v } });
  };
  return (
    <PublicShell>
      <section className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Tracking</p>
        <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">Where's my parcel?</h1>
        <p className="mt-3 text-muted-foreground">
          Enter your Boostify tracking number — it starts with <span className="font-semibold">BST</span>.
        </p>
        <form onSubmit={submit} className="mt-8 flex gap-2">
          <input
            value={tn}
            onChange={(e) => setTn(e.target.value)}
            placeholder="BST240101ABCDEF"
            className="flex-1 rounded-full border border-input bg-background px-5 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">
            Track
          </button>
        </form>
      </section>
    </PublicShell>
  );
}
