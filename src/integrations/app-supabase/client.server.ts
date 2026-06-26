// Server-only admin client. Service role bypasses RLS — never import from
// route components or *.functions.ts module scope. Load inside handlers:
//   const { supabaseAdmin } = await import("@/integrations/app-supabase/client.server");
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { APP_SUPABASE_URL } from "./config";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseAdminClient() {
  const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("Missing APP_SUPABASE_SERVICE_ROLE_KEY secret.");
  }
  return createClient<Database>(APP_SUPABASE_URL, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
