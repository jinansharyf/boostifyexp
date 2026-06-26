import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/app-supabase/client";
import { Wordmark } from "@/components/site/public-shell";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/messages")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
  },
  component: MessagesPage,
});

type Vendor = { id: string; name: string; owner_id: string };
type Thread = { id: string; vendor_id: string; subject: string | null; last_message_at: string };
type Message = { id: string; thread_id: string; sender_id: string; body: string; created_at: string };

function MessagesPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: vendors = [] } = useQuery({
    queryKey: ["msg-vendors", isAdmin, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const base = supabase.from("vendors").select("id, name, owner_id").order("name");
      const { data, error } = isAdmin ? await base : await base.eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as Vendor[];
    },
  });

  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedVendor && vendors[0]) setSelectedVendor(vendors[0].id);
  }, [vendors, selectedVendor]);

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

  const [draft, setDraft] = useState("");
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
          <h2 className="px-2 pb-2 font-display text-sm font-semibold text-muted-foreground">
            {isAdmin ? "Partners" : "Conversations"}
          </h2>
          <ul className="space-y-1">
            {vendors.length === 0 && (
              <li className="px-2 py-3 text-sm text-muted-foreground">
                {isAdmin ? "No partners yet." : "No vendor profile assigned to your account."}
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
                  {v.name}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex h-[70vh] flex-col rounded-3xl border border-border bg-card">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
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
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                    }`}
                  >
                    {m.body}
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
    </div>
  );
}