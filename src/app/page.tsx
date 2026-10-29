import { connection } from "next/server";
import { Suspense } from "react";
import { entrarConGoogle } from "@/app/auth/acciones";
import { EstadoVacio } from "@/components/estado-vacio";
import { TarjetaPuesto } from "@/components/tiendas/tarjeta-puesto";
import { Button } from "@/components/ui/button";
import { VivosAhora } from "@/components/vivos/vivos-ahora";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { idsSeguidos, listarPuestos } from "@/lib/tiendas/datos";
import { listarVivosAbiertos } from "@/lib/vivos/datos";

type Props = { searchParams: Promise<{ error?: string | string[] }> };

async function MensajeDeError({ searchParams }: Props) {
  const { error } = await searchParams;
  if (error !== "login") return null;
  return (
    <p role="alert" className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground">
      No pudimos hacerte entrar. Probá de nuevo.
    </p>
  );
}

async function Puestos() {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  const [puestos, vivos, seguidos] = await Promise.all([
    listarPuestos(supabase),
    listarVivosAbiertos(supabase),
    userId ? idsSeguidos(supabase, userId) : Promise.resolve(new Set<string>()),
  ]);
  const enVivo = new Set(vivos.map((v) => v.puesto.id));
  return (
    <>
      {!userId && (
        <form action={entrarConGoogle}>
          <Button type="submit" size="lg" className="w-full">Entrar con Google</Button>
        </form>
      )}
      <VivosAhora iniciales={vivos} />
      <h2 className="text-lg font-bold">Puestos</h2>
      {puestos.length === 0 ? (
        <EstadoVacio texto="Pronto vas a ver acá los puestos de Tu Feria Live." />
      ) : (
        <div className="flex flex-col gap-3">
          {puestos.map((p) => (
            <TarjetaPuesto key={p.id} puesto={p} siguiendo={seguidos.has(p.id)} conSesion={Boolean(userId)} enVivo={enVivo.has(p.id)} />
          ))}
        </div>
      )}
    </>
  );
}

export default function InicioPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex flex-col gap-1 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">Tu Feria Live</h1>
        <p className="text-muted-foreground">Vendé en vivo, sin que nadie te corte</p>
      </header>
      <Suspense>
        <MensajeDeError searchParams={searchParams} />
      </Suspense>
      <Suspense>
        <Puestos />
      </Suspense>
    </main>
  );
}
