import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { buttonVariants } from "@/components/ui/button";
import { SalaVivo } from "@/components/vivos/sala-vivo";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createClient } from "@/lib/supabase/server";
import { idsSeguidos, listarProductos, obtenerTiendaPorHandle } from "@/lib/tiendas/datos";
import { obtenerConfigVivo, vivoAbiertoDe } from "@/lib/vivos/datos";

/** Cuántos productos se muestran mientras espera el vivo. */
const PRODUCTOS_EN_ESPERA = 3;

export async function generateMetadata({ params }: PageProps<"/tienda/[handle]/vivo">): Promise<Metadata> {
  const { handle } = await params;
  const tienda = await obtenerTiendaPorHandle(await createClient(), decodeURIComponent(handle));
  return { title: tienda ? `Vivo de ${tienda.name} · Tu Feria Live` : "Puesto no encontrado · Tu Feria Live" };
}

async function Contenido({ params }: { params: Promise<{ handle: string }> }) {
  await connection();
  const { handle } = await params;
  const supabase = await createClient();
  const tienda = await obtenerTiendaPorHandle(supabase, decodeURIComponent(handle));
  if (!tienda) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <EstadoVacio texto="No encontramos este puesto." accion={<Link href="/" className={buttonVariants()}>Ir al inicio</Link>} />
      </main>
    );
  }
  const userId = await obtenerUsuarioId(supabase);
  const [productos, vivo, config, seguidos] = await Promise.all([
    listarProductos(supabase, tienda.id),
    vivoAbiertoDe(supabase, tienda.id),
    obtenerConfigVivo(supabase),
    userId ? idsSeguidos(supabase, userId) : Promise.resolve(new Set<string>()),
  ]);
  const visibles = productos
    .filter((p) => p.visible)
    .slice(0, PRODUCTOS_EN_ESPERA)
    .map((p) => ({ id: p.id, price_cents: p.price_cents, foto: p.fotos[0]?.path ?? null }));

  return (
    <SalaVivo
      tienda={{
        id: tienda.id, handle: tienda.handle, name: tienda.name,
        avatar_path: tienda.avatar_path, live_schedule_note: tienda.live_schedule_note,
      }}
      productos={visibles}
      vivoInicial={vivo}
      config={config}
      siguiendo={seguidos.has(tienda.id)}
      conSesion={Boolean(userId)}
    />
  );
}

export default function SalaVivoPage({ params }: PageProps<"/tienda/[handle]/vivo">) {
  return (
    <Suspense>
      <Contenido params={params} />
    </Suspense>
  );
}
