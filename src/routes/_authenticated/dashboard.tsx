import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/app-supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (list.includes("super_admin") || list.includes("admin")) throw redirect({ to: "/admin" });
    if (list.includes("vendor")) throw redirect({ to: "/vendor" });
    // Staff member? Route to /staff
    const { data: staff } = await supabase
      .from("staff_members" as any)
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (staff) throw redirect({ to: "/staff" });
    // No role assigned yet — route to the partner application flow.
    throw redirect({ to: "/vendor/register" });
  },
  component: () => null,
});
