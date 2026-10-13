import { createServerClient } from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

type Cookie = { name: string; value: string; domain: string; path: string; sameSite: "Lax" };

/** Convierte una sesión en las cookies que espera la app, usando el mismo formato de @supabase/ssr. */
export async function cookiesDeSesion(sesion: Session): Promise<Cookie[]> {
  const guardadas = new Map<string, string>();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => [...guardadas].map(([name, value]) => ({ name, value })),
        setAll: (lista) =>
          lista.forEach(({ name, value }) => (value ? guardadas.set(name, value) : guardadas.delete(name))),
      },
    },
  );
  const { error } = await supabase.auth.setSession({
    access_token: sesion.access_token,
    refresh_token: sesion.refresh_token,
  });
  if (error) throw error;
  return [...guardadas].map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
    sameSite: "Lax",
  }));
}
