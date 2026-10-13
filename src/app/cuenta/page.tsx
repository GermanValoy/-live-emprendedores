import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { salir } from "@/app/auth/acciones";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

async function Saludo() {
  await connection(); // el saludo depende de quién entra: se arma en cada visita
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/");

  const { data: perfil } = await supabase
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const nombre: string = perfil?.display_name ?? "";
  const foto: string | null = perfil?.avatar_url ?? null;
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      {foto?.startsWith("https://lh3.googleusercontent.com/") ? (
        <Image src={foto} alt="Tu foto" width={96} height={96} className="rounded-full" />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-coral text-4xl font-extrabold text-white"
        >
          {inicial}
        </div>
      )}
      <h1 className="max-w-full break-words text-3xl font-extrabold">
        {nombre ? `Hola, ${nombre}` : "Hola"}
      </h1>
    </>
  );
}

export default function CuentaPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Suspense fallback={<div aria-hidden="true" className="size-24 animate-pulse rounded-full bg-muted" />}>
        <Saludo />
      </Suspense>
      <form action={salir}>
        <Button type="submit" variant="secondary">
          Salir
        </Button>
      </form>
    </main>
  );
}
