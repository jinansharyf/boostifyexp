import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/app-supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    if (prof?.must_change_password) throw redirect({ to: "/auth/change-password" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (list.includes("super_admin") || list.includes("admin")) throw redirect({ to: "/admin" });
    if (list.includes("vendor")) throw redirect({ to: "/vendor" });
    throw redirect({ to: "/customer" });
  },
  component: () => null,
});
