import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: (s: Record<string, unknown>) => ({
    vendor: typeof s.vendor === "string" ? s.vendor : undefined,
  }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
  },
  component: MessagesPage,
});

type Vendor = { id: string; store_name: string; owner_id: string | null; phone?: string | null; email?: string | null };
type Thread = { id: string; vendor_id: string; subject: string | null; last_message_at: string };
type Message = {
  id: string; thread_id: string; sender_id: string; body: string;
  image_url?: string | null; file_name?: string | null; file_type?: string | null;
  created_at: string;
};

function MessagesPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { vendor: vendorParam } = Route.useSearch();

  const { data: vendors = [] } = useQuery({
    queryKey: ["msg-vendors", isAdmin, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        // Admins only see partners who have an open conversation.
        const { data: threads, error: tErr } = await supabase
          .from("chat_threads")
          .select("vendor_id, last_message_at")
          .order("last_message_at", { ascending: false });
        if (tErr) throw tErr;
        const ids = Array.from(new Set((threads ?? []).map((t: any) => t.vendor_id))).filter(Boolean);
        if (ids.length === 0) return [] as Vendor[];
        const { data, error } = await supabase
          .from("vendors")
          .select("id, store_name, owner_id")
          .in("id", ids);
        if (error) throw error;
        // preserve recency order from threads
        const order = new Map(ids.map((id, i) => [id, i]));
        return ((data ?? []) as Vendor[]).sort(
          (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
        );
      }
      const { data, error } = await supabase
        .from("vendors")
        .select("id, store_name, owner_id")
        .eq("owner_id", user!.id)
        .order("store_name");
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

  // For admin: full approved vendor directory (for "New chat" search)
  const { data: approvedVendors = [] } = useQuery({
    queryKey: ["approved-vendors-directory"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, store_name, owner_id, phone, profiles:owner_id(email)")
        .eq("status", "approved")
        .order("store_name");
      if (error) throw error;
      return (data ?? []).map((v: any) => ({
        id: v.id,
        store_name: v.store_name,
        owner_id: v.owner_id,
        phone: v.phone,
        email: v.profiles?.email ?? null,
      })) as Vendor[];
    },
  });

  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  useEffect(() => {
    if (vendorParam) {
      setSelectedVendor(vendorParam);
      return;
    }
    if (!selectedVendor && vendors[0]) setSelectedVendor(vendors[0].id);
  }, [vendors, selectedVendor, vendorParam]);

  const { data: thread } = useQuery({
    queryKey: ["msg-thread", selectedVendor],
    enabled: !!selectedVendor && !!user,
    queryFn: async () => {
      const { data: existing, error: e1 } = await supabase
        .from("chat_threads")
        .select("*")
        .eq("vendor_id", selectedVendor!)
        .maybeSingle();
      if (e1) throw e1;
      if (existing) return existing as Thread;
      const { data: created, error } = await supabase
        .from("chat_threads")
        .insert({ vendor_id: selectedVendor! })
        .select()
        .single();
      if (error) {
        // Likely a non-super admin opening a vendor without a thread yet.
        return null;
      }
      return created as Thread;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["msg-list", thread?.id],
    enabled: !!thread,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", thread!.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Message[];
    },
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      if (!thread || !user) throw new Error("No thread");
      const { error } = await supabase
        .from("chat_messages")
        .insert({ thread_id: thread.id, sender_id: user.id, body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["msg-list", thread?.id] }),
  });

  const deleteThread = useMutation({
    mutationFn: async (threadId: string) => {
      // Delete messages first (in case cascade isn't reliable), then thread.
      await supabase.from("chat_messages").delete().eq("thread_id", threadId);
      const { data, error } = await supabase
        .from("chat_threads")
        .delete()
        .eq("id", threadId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Delete blocked by permissions. Run db/migrations/0005_chat_images_and_search.sql.");
    },
    onSuccess: () => {
      setSelectedVendor(null);
      qc.invalidateQueries({ queryKey: ["msg-vendors"] });
      qc.invalidateQueries({ queryKey: ["msg-thread"] });
      toast.success("Conversation deleted.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [search, setSearch] = useState("");

  const filteredApproved = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return approvedVendors;
    return approvedVendors.filter((v) =>
      [v.store_name, v.phone, v.email].filter(Boolean).some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [approvedVendors, search]);

  const sendImage = useMutation({
    mutationFn: async (payload: { url: string; name: string; type: string }) => {
      if (!thread || !user) throw new Error("No thread");
      const { error } = await supabase
        .from("chat_messages")
        .insert({
          thread_id: thread.id, sender_id: user.id, body: "",
          image_url: payload.url, file_name: payload.name, file_type: payload.type,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["msg-list", thread?.id] }),
  });

  const handleFile = async (file: File) => {
    if (file.size > 15 * 1024 * 1024) return toast.error("Max 15 MB.");
    if (!thread) return toast.error("Open a conversation first.");
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${thread.id}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
      await sendImage.mutateAsync({ url: data.publicUrl, name: file.name, type: file.type });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const backTo = isAdmin ? "/admin" : "/vendor";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="min-w-0 flex-1"><Wordmark /></div>
          <Link to={backTo} className="shrink-0 text-sm text-muted-foreground">← Back</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <h2 className="font-display text-sm font-semibold text-muted-foreground">
              {isAdmin ? "Partners" : "Conversations"}
            </h2>
            {isAdmin && (
              <button
                type="button"
                onClick={() => { setShowNewChat(true); setSearch(""); }}
                className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
              >
                + New
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {vendors.length === 0 && (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                {isAdmin
                  ? "No conversations yet. Partners will appear here once they message you."
                  : "No vendor profile assigned to your account."}
              </li>
            )}
            {vendors.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setSelectedVendor(v.id)}
                  className={`w-full truncate rounded-xl px-3 py-2 text-left text-sm ${
                    selectedVendor === v.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary"
                  }`}
                >
                  {isAdmin ? v.store_name : "Boostify Support"}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex h-[70vh] flex-col overflow-hidden rounded-3xl border border-border bg-card">
          {selectedVendor && (() => {
            const v = vendors.find((x) => x.id === selectedVendor) ?? approvedVendors.find((x) => x.id === selectedVendor);
            const name = isAdmin ? (v?.store_name ?? "Partner") : "Boostify Support";
            const initials = name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                    {initials || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-semibold">{name}</div>
                    <div className="text-xs text-muted-foreground">
                      {thread ? "Active conversation" : "No messages yet"}
                    </div>
                  </div>
                </div>
                {isAdmin && thread && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Delete this entire conversation? This cannot be undone.")) {
                        deleteThread.mutate(thread.id);
                      }
                    }}
                    disabled={deleteThread.isPending}
                    className="shrink-0 rounded-full border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {deleteThread.isPending ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            );
          })()}
          <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-muted/30 p-4">
            {!selectedVendor && (
              <p className="text-center text-sm text-muted-foreground">Select a partner to start chatting.</p>
            )}
            {selectedVendor && !thread && (
              <p className="text-center text-sm text-muted-foreground">
                {isAdmin
                  ? "This partner hasn't opened a conversation yet."
                  : "Starting a new conversation..."}
              </p>
            )}
            {messages.map((m, i) => {
              const mine = m.sender_id === user?.id;
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const groupedTop = prev && prev.sender_id === m.sender_id && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) < 5 * 60_000;
              const groupedBot = next && next.sender_id === m.sender_id && (new Date(next.created_at).getTime() - new Date(m.created_at).getTime()) < 5 * 60_000;
              const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const isLastMine = mine && !next;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} ${groupedTop ? "mt-0.5" : "mt-2"}`}>
                  <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div
                      className={[
                        "px-3.5 py-2 text-sm shadow-sm break-words whitespace-pre-wrap",
                        mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground border border-border",
                        "rounded-2xl",
                        mine
                          ? `${groupedTop ? "rounded-tr-md" : ""} ${groupedBot ? "rounded-br-md" : ""}`
                          : `${groupedTop ? "rounded-tl-md" : ""} ${groupedBot ? "rounded-bl-md" : ""}`,
                      ].join(" ")}
                    >
                       {m.image_url && (m.file_type?.startsWith("image/") || !m.file_type) && /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(m.image_url) ? (
                        <a href={m.image_url} target="_blank" rel="noreferrer">
                          <img src={m.image_url} alt={m.file_name ?? ""} className={`${m.body ? "mb-2" : ""} max-h-60 rounded-xl object-cover`} />
                        </a>
                      ) : m.image_url ? (
                        <a
                          href={m.image_url}
                          target="_blank"
                          rel="noreferrer"
                          download={m.file_name ?? true}
                          className={`${m.body ? "mb-2" : ""} flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-foreground hover:bg-background`}
                        >
                          <span className="text-lg">📄</span>
                          <span className="flex-1 truncate text-xs font-medium">{m.file_name ?? "Attachment"}</span>
                          <span className="text-[10px] text-muted-foreground">Download</span>
                        </a>
                      ) : null}
                      {m.body}
                    </div>
                    {!groupedBot && (
                      <div className={`mt-1 flex items-center gap-1 px-1 text-[10px] text-muted-foreground ${mine ? "flex-row-reverse" : ""}`}>
                        <span>{time}</span>
                        {isLastMine && <span className="text-primary">✓✓ Delivered</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {thread && messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">No messages yet. Say hi 👋</p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = draft.trim();
              if (!v) return;
              send.mutate(v);
              setDraft("");
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <input
              ref={fileRef}
              type="file"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!thread || uploading}
              title="Attach file or image"
              className="rounded-full border border-input px-3 py-2 text-sm disabled:opacity-50"
            >
              {uploading ? "…" : "📎"}
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={thread ? "Type a message..." : "Select a partner"}
              disabled={!thread || send.isPending}
              className="flex-1 rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!thread || !draft.trim() || send.isPending}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>
      </main>

      {showNewChat && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20"
          onClick={() => setShowNewChat(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-xl"
          >
            <div className="flex items-center justify-between pb-2">
              <h3 className="font-display text-base font-semibold">Start new chat</h3>
              <button onClick={() => setShowNewChat(false)} className="text-sm text-muted-foreground">✕</button>
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="w-full rounded-full border border-input bg-background px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <ul className="mt-3 max-h-80 space-y-1 overflow-y-auto">
              {filteredApproved.length === 0 && (
                <li className="px-2 py-3 text-sm text-muted-foreground">No matching approved vendors.</li>
              )}
              {filteredApproved.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => { setSelectedVendor(v.id); setShowNewChat(false); }}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <div className="font-medium">{v.store_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[v.email, v.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}