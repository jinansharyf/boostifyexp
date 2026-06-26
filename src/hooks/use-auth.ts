import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/app-supabase/client";
import type { Database } from "@/integrations/app-supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type AppPermission = Database["public"]["Enums"]["app_permission"];

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<AppPermission[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (uid: string | undefined) => {
      if (!uid) {
        setRoles([]);
        setPermissions([]);
        setMustChangePassword(false);
        return;
      }
      const [r, p, prof] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_permissions").select("permission").eq("user_id", uid),
        supabase.from("profiles").select("must_change_password").eq("id", uid).maybeSingle(),
      ]);
      if (!active) return;
      setRoles((r.data ?? []).map((x) => x.role));
      setPermissions((p.data ?? []).map((x) => x.permission));
      setMustChangePassword(!!prof.data?.must_change_password);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      load(data.session?.user.id).finally(() => active && setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      load(newSession?.user.id);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = isSuperAdmin || roles.includes("admin");

  return {
    session,
    user,
    roles,
    permissions,
    loading,
    mustChangePassword,
    isSuperAdmin,
    isAdmin,
    isVendor: roles.includes("vendor"),
    isCustomer: roles.includes("customer"),
    hasPermission: (p: AppPermission) => isSuperAdmin || permissions.includes(p),
  };
}
