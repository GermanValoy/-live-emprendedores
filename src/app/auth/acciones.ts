"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { rutaSegura } from "@/lib/auth/ruta-segura";
import { createClient } from "@/lib/supabase/server";

export async function entrarConGoogle(formData: FormData) {
  const origin = (await headers()).get("origin");
  if (!origin) redirect("/?error=login");
  const next = formData.get("next");
  const destino = rutaSegura(typeof next === "string" ? next : null);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destino)}` },
  });
  if (error || !data.url) redirect("/?error=login");
  redirect(data.url);
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
