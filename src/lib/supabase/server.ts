import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/** Cliente de Supabase para el servidor. Crear uno nuevo en cada uso; no guardarlo en una variable global. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el proxy renueva la sesión.
        }
      },
    },
  });
}
