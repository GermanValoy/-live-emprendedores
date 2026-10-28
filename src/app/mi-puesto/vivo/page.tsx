import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EstadoVacio } from "@/components/estado-vacio";
import { buttonVariants } from "@/components/ui/button";
import { EstudioVivo } from "@/components/vivos/estudio-vivo";
import { obtenerUsuarioId } from "@/lib/auth/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { obtenerMiTienda } from "@/lib/tiendas/datos";
import { ErrorCloudflare, type UrlsTransmision } from "@/lib/vivos/cloudflare";
import { credencialesCloudflare } from "@/lib/vivos/config";
import { obtenerConfigVivo, vivoAbiertoDe } from "@/lib/vivos/datos";
import { obtenerTransmisionDelPuesto } from "@/lib/vivos/transmision-puesto";

export const metadata: Metadata = { title: "Salir en vivo · Tu Feria Live", robots: { index: false, follow: false } };

async function ContenidoVivo() {
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
  if (tienda.onboarding_step < 5) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border p-4">
        <p className="font-semibold">Terminá de armar tu puesto para salir en vivo.</p>
        <Link href="/mi-puesto/armar" className={buttonVariants()}>Seguir armando</Link>
      </div>
    );
  }

  let urls: UrlsTransmision;
  try {
    // La URL para transmitir es una credencial: se lee con la llave secreta y solo llega a la dueña.
    urls = await obtenerTransmisionDelPuesto(tienda.id, { db: createAdminClient(), cred: credencialesCloudflare() });
  } catch (error) {
    if (!(error instanceof ErrorCloudflare)) throw error;
    console.error("mi-puesto/vivo: transmisión", error.message);
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-2xl border p-4">
        <p className="font-semibold">No pudimos preparar la transmisión. Probá de nuevo en un rato.</p>
        {/* Link común (no de Next) para que la página se vuelva a pedir entera. */}
        <a href="/mi-puesto/vivo" className={buttonVariants()}>Probar de nuevo</a>
      </div>
    );
  }
  const [config, vivoAbierto] = await Promise.all([obtenerConfigVivo(supabase), vivoAbiertoDe(supabase, tienda.id)]);
  return (
    <EstudioVivo
      tienda={{ id: tienda.id, handle: tienda.handle, name: tienda.name }}
      urlTransmitir={urls.urlTransmitir}
      config={config}
      vivoAbierto={vivoAbierto}
    />
  );
}

export default function VivoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Suspense>
        <ContenidoVivo />
      </Suspense>
    </main>
  );
}
