import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { buttonVariants } from "@/components/ui/button";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";

async function ContenidoMiPuesto({ searchParams }: { searchParams: Promise<{ listo?: string | string[] }> }) {
  await connection();
  const supabase = await createClient();
  const userId = await obtenerUsuarioId(supabase);
  if (!userId) redirect("/");
  const tienda = await obtenerMiTienda(supabase, userId);
  if (!tienda) {
    return (
      <EstadoVacio
        titulo="Todavía no tenés un puesto."
        texto="Si querés vender en Tu Feria Live, pedí una invitación."
        accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>}
      />
    );
  }
  const { listo } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-extrabold">Hola, {tienda.name}</h1>
      {listo === "1" && (
        <p role="status" className="rounded-2xl bg-accent p-4 font-semibold">
          ¡Tu puesto está listo!
        </p>
      )}
      {tienda.onboarding_step < 5 && (
        <div className="flex flex-col gap-2 rounded-2xl border p-4">
          <p className="font-semibold">Te falta terminar de armar tu puesto.</p>
          <Link href="/mi-puesto/armar" className={buttonVariants()}>Seguir armando</Link>
        </div>
      )}
      <nav aria-label="Opciones del puesto" className="grid gap-2">
        <Link href="/mi-puesto/productos" className={buttonVariants({ variant: "secondary" })}>Mis productos</Link>
        <Link href="/mi-puesto/tienda" className={buttonVariants({ variant: "secondary" })}>Mi tienda</Link>
        <Link href={`/@${tienda.handle}`} className={buttonVariants({ variant: "ghost" })}>Ver mi tienda como la ven las demás</Link>
      </nav>
    </>
  );
}

export default function MiPuestoPage({ searchParams }: PageProps<"/mi-puesto">) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <ContenidoMiPuesto searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
