import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente con la llave secreta: salta las reglas de la base. Solo para código de servidor. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  return createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });
}
