import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyNewChatMessage } from "@/lib/chat-notifications.functions";

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

type Vendor = {
  id: string; store_name: string; owner_id: string | null;
  phone?: string | null; email?: string | null;
  logo_url?: string | null; cuisine?: string | null; address?: string | null;
  description?: string | null;
};
type QuickReply = { id: string; label: string; body: string };
type Thread = { id: string; vendor_id: string; subject: string | null; last_message_at: string };
type Message = {
  id: string; thread_id: string; sender_id: string; body: string;
  image_url?: string | null; file_name?: string | null; file_type?: string | null;
  created_at: string;
};

type AttachmentPayload = { url: string; name: string; type: string };

const ATTACHMENT_PREFIX = "__chat_attachment__:";

function makeAttachmentBody(payload: AttachmentPayload) {
  return `${ATTACHMENT_PREFIX}${JSON.stringify(payload)}`;
}

function getMessageAttachment(message: Message): AttachmentPayload | null {
  if (message.image_url) {
    return {
      url: message.image_url,
      name: message.file_name ?? "Attachment",
      type: message.file_type ?? "",
    };
  }
  const raw = (message.body ?? "").trim();
  if (!raw) return null;
  // 1) Encoded prefix form
  const prefixIdx = raw.indexOf(ATTACHMENT_PREFIX);
  if (prefixIdx !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(prefixIdx + ATTACHMENT_PREFIX.length));
      if (typeof parsed?.url === "string") {
        return {
          url: parsed.url,
          name: typeof parsed.name === "string" ? parsed.name : "Attachment",
          type: typeof parsed.type === "string" ? parsed.type : "",
        };
      }
    } catch { /* fall through */ }
  }
  // 2) Plain JSON object with url/name/type
  if (raw.startsWith("{") && raw.includes('"url"')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.url === "string") {
        return {
          url: parsed.url,
          name: typeof parsed.name === "string" ? parsed.name : "Attachment",
          type: typeof parsed.type === "string" ? parsed.type : "",
        };
      }
    } catch { /* fall through */ }
  }
  // 3) Bare URL pointing at our chat-attachments bucket
  const urlMatch = raw.match(/https?:\/\/\S+\/storage\/v1\/object\/public\/chat-(?:attachments|images)\/\S+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    const name = decodeURIComponent(url.split("/").pop() ?? "Attachment").replace(/^\d+_/, "");
    const ext = (url.split(".").pop() ?? "").toLowerCase();
    const isImg = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"].includes(ext);
    return { url, name, type: isImg ? `image/${ext}` : "" };
  }
  return null;
}

function getVisibleMessageBody(message: Message) {
  if (!message.body) return message.body;
  if (getMessageAttachment(message)) return "";
  return message.body;
}

function MessagesPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const { vendor: vendorParam } = Route.useSearch();
  const notifyFn = useServerFn(notifyNewChatMessage);

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
          .select("id, store_name, owner_id, logo_url, cuisine, phone, address, description")
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
        .select("id, store_name, owner_id, logo_url, cuisine, phone, address, description")
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
        .select("id, store_name, owner_id, phone, logo_url, cuisine, address, description, profiles:owner_id(email)")
        .eq("status", "approved")
        .order("store_name");
      if (error) throw error;
      return (data ?? []).map((v: any) => ({
        id: v.id,
        store_name: v.store_name,
        owner_id: v.owner_id,
        phone: v.phone,
        logo_url: v.logo_url,
        cuisine: v.cuisine,
        address: v.address,
        description: v.description,
        email: v.profiles?.email ?? null,
      })) as Vendor[];
    },
  });

  // Quick replies are visible to all authenticated users but only admins use them in UI.
  const { data: quickReplies = [] } = useQuery({
    queryKey: ["quick-replies"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from("quick_replies" as any) as any)
        .select("id, label, body")
        .order("sort_order", { ascending: true });
      if (error) return [] as QuickReply[];
      return (data ?? []) as QuickReply[];
    },
  });
  const [showQuick, setShowQuick] = useState(false);

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
      notifyFn({ data: { thread_id: thread.id, preview: body } }).catch(() => {});
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
    mutationFn: async (payload: AttachmentPayload) => {
      if (!thread || !user) throw new Error("No thread");
      const { error } = await supabase
        .from("chat_messages")
        .insert({
          thread_id: thread.id,
          sender_id: user.id,
          body: makeAttachmentBody(payload),
        });
      if (error) throw error;
      notifyFn({ data: { thread_id: thread.id, has_attachment: true } }).catch(() => {});
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          {/* Mobile: back to list when a chat is open */}
          {selectedVendor && (
            <button
              type="button"
              onClick={() => setSelectedVendor(null)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-lg md:hidden"
              aria-label="Back to conversations"
            >
              ‹
            </button>
          )}
          <div className="min-w-0 flex-1"><Wordmark /></div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[280px_minmax(0,1fr)] md:gap-4 md:px-4 md:py-4">
        <aside
          className={`flex-col overflow-y-auto border-border bg-card md:flex md:rounded-3xl md:border md:p-3 ${
            selectedVendor ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 md:static md:border-none md:px-2 md:py-2">
            <h2 className="font-display text-sm font-semibold text-muted-foreground">
              {isAdmin ? "Partners" : "Conversations"}
            </h2>
            {isAdmin && (
              <button
                type="button"
                onClick={() => { setShowNewChat(true); setSearch(""); }}
                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
              >
                + New chat
              </button>
            )}
          </div>
          <ul className="space-y-0.5 p-2 md:space-y-1 md:p-0">
            {vendors.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {isAdmin
                  ? "No conversations yet. Partners will appear here once they message you."
                  : "No vendor profile assigned to your account."}
              </li>
            )}
            {vendors.map((v) => {
              const name = isAdmin ? v.store_name : "Boostify Support";
              const initials = name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
              const active = selectedVendor === v.id;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedVendor(v.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      active ? "bg-primary/10 text-foreground" : "hover:bg-secondary"
                    }`}
                  >
                    {isAdmin && v.logo_url ? (
                      <img src={v.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                        active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
                      }`}>
                        {initials || "?"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {isAdmin ? (v.cuisine || v.phone || "Tap to open") : "Tap to open"}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section
          className={`flex-col overflow-hidden border-border bg-card md:flex md:rounded-3xl md:border ${
            selectedVendor ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedVendor && (() => {
            const v = vendors.find((x) => x.id === selectedVendor) ?? approvedVendors.find((x) => x.id === selectedVendor);
            const name = isAdmin ? (v?.store_name ?? "Partner") : "Boostify Support";
            const initials = name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
                <div className="flex min-w-0 items-center gap-3">
                  {isAdmin && v?.logo_url ? (
                    <img src={v.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                      {initials || "?"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-semibold">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {isAdmin
                        ? [v?.cuisine, v?.phone, v?.address].filter(Boolean).join(" · ") || (thread ? "Active conversation" : "No messages yet")
                        : (thread ? "Active conversation" : "No messages yet")}
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
                    className="shrink-0 rounded-full border border-destructive/40 p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    title="Delete conversation"
                    aria-label="Delete conversation"
                  >
                    {deleteThread.isPending ? "…" : "🗑"}
                  </button>
                )}
              </div>
            );
          })()}
          <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto bg-muted/30 p-3 sm:p-4">
            {!selectedVendor && (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-2xl">💬</div>
                  <p className="mt-3 text-sm font-medium">Select a conversation</p>
                  <p className="mt-1 text-xs text-muted-foreground">Pick a partner from the list to start chatting.</p>
                </div>
              </div>
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
              const attachment = getMessageAttachment(m);
              const visibleBody = getVisibleMessageBody(m);
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
                       {attachment && (attachment.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(attachment.url)) ? (
                        <a href={attachment.url} target="_blank" rel="noreferrer">
                          <img src={attachment.url} alt={attachment.name} className={`${visibleBody ? "mb-2" : ""} max-h-60 rounded-xl object-cover`} />
                        </a>
                      ) : attachment ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          download={attachment.name}
                          className={`${visibleBody ? "mb-2" : ""} flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-foreground hover:bg-background`}
                        >
                          <span className="text-lg">📄</span>
                          <span className="flex-1 truncate text-xs font-medium">{attachment.name}</span>
                          <span className="text-[10px] text-muted-foreground">Download</span>
                        </a>
                      ) : null}
                      {visibleBody}
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
            className="flex items-end gap-2 border-t border-border bg-card p-2 sm:p-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
            {isAdmin && quickReplies.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowQuick((s) => !s)}
                  disabled={!thread}
                  title="Quick replies"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-input text-base disabled:opacity-50"
                >⚡</button>
                {showQuick && (
                  <div className="absolute bottom-12 left-0 z-20 w-72 rounded-2xl border border-border bg-card p-2 shadow-xl">
                    <div className="px-2 pb-1 text-[10px] uppercase text-muted-foreground">Quick replies</div>
                    {quickReplies.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => { setDraft(q.body); setShowQuick(false); }}
                        className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary"
                      >
                        <div className="font-medium">{q.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{q.body}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!thread || uploading}
              title="Attach file or image"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-input text-base disabled:opacity-50"
            >
              {uploading ? "…" : "📎"}
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={thread ? "Type a message..." : "Select a partner"}
              disabled={!thread || send.isPending}
              className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!thread || !draft.trim() || send.isPending}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50 sm:h-auto sm:w-auto sm:px-5 sm:py-2.5 sm:text-sm sm:font-semibold"
              aria-label="Send"
            >
              <span className="sm:hidden">➤</span>
              <span className="hidden sm:inline">Send</span>
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